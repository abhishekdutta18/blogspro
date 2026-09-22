#include <iostream>
#include <fstream>
#include <thread>
#include <csignal>
#include <sstream>
#include <cstdlib>
#include <unordered_map>
#include <mutex>
#include <chrono>
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <httplib.h>
#include <nlohmann/json.hpp>
#include <filesystem>
#include <libtorrent/magnet_uri.hpp>
#include <libtorrent/error_code.hpp>
#include "engine.hpp"
#include "search.hpp"
#include "rss_worker.hpp"
#include <fstream>
#include <filesystem>

using json = nlohmann::json;

static httplib::Server* g_svr = nullptr;
static std::unordered_map<std::string, std::string> known_names;
static std::mutex known_names_mutex;

bool is_port_free(int port) {
    int sock = ::socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) return false;
    int opt = 1;
    ::setsockopt(sock, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    addr.sin_port = htons(port);
    bool free = (::bind(sock, (struct sockaddr*)&addr, sizeof(addr)) == 0);
    ::close(sock);
    return free;
}

void signal_handler(int signum) {
    (void)signum;
    if (g_svr) {
        g_svr->stop();
    }
}

// Helper to auto-discover local Jackett configuration
void auto_discover_jackett(torrent::SearchEngine& search) {
    const char* home_env = getenv("HOME");
    if (!home_env) {
        std::cerr << "HOME environment variable not set. Skipping Jackett discovery." << std::endl;
        return;
    }
    std::string config_path = std::string(home_env) + "/Library/Application Support/Jackett/ServerConfig.json";
    std::ifstream file(config_path);
    if (file.is_open()) {
        try {
            json config = json::parse(file);
            std::string api_key = config.value("APIKey", "");
            if (!api_key.empty()) {
                std::cout << "Auto-discovered local Jackett API Key." << std::endl;
                search.add_jackett_instance("http://127.0.0.1:9117", api_key);
                return;
            }
        } catch (...) {}
    }
    std::cerr << "Failed to auto-discover Jackett API Key. Make sure Jackett is installed." << std::endl;
}


nlohmann::json global_settings;
void load_global_settings(torrent::Engine& engine, torrent::RssWorker& rss_worker) {
    std::string home = getenv("HOME") ? getenv("HOME") : "/tmp";
    std::string path = home + "/.fluxtorrent/settings.json";
    if (std::filesystem::exists(path)) {
        std::ifstream f(path);
        f >> global_settings;
    }
    if (global_settings.contains("downloadLimit")) engine.set_download_limit(global_settings["downloadLimit"].get<int>() / 1024);
    if (global_settings.contains("uploadLimit")) engine.set_upload_limit(global_settings["uploadLimit"].get<int>() / 1024);
    if (global_settings.contains("rssFeeds")) rss_worker.set_feeds(global_settings["rssFeeds"].get<std::vector<std::string>>());
    if (global_settings.contains("rssRules")) rss_worker.set_rules(global_settings["rssRules"].get<std::vector<std::string>>());
}
void save_global_settings() {
    std::string home = getenv("HOME") ? getenv("HOME") : "/tmp";
    std::ofstream f(home + "/.fluxtorrent/settings.json");
    f << global_settings.dump(4);
}

void setup_settings_routes(httplib::Server& svr, torrent::Engine& engine, torrent::RssWorker& rss_worker) {
    
    svr.Get("/api/settings", [&](const httplib::Request&, httplib::Response& res) {
        if (!global_settings.contains("downloadLimit")) global_settings["downloadLimit"] = engine.get_download_limit() * 1024;
        if (!global_settings.contains("uploadLimit")) global_settings["uploadLimit"] = engine.get_upload_limit() * 1024;
        if (!global_settings.contains("rssFeeds")) global_settings["rssFeeds"] = std::vector<std::string>();
        if (!global_settings.contains("rssRules")) global_settings["rssRules"] = std::vector<std::string>();
        res.set_content(global_settings.dump(), "application/json");
    });


    
    svr.Post("/api/settings", [&](const httplib::Request& req, httplib::Response& res) {
        try {
            auto body = json::parse(req.body);
            for (auto it = body.begin(); it != body.end(); ++it) {
                global_settings[it.key()] = it.value();
            }
            if (body.contains("downloadLimit")) engine.set_download_limit(body["downloadLimit"].get<int>() / 1024);
            if (body.contains("uploadLimit")) engine.set_upload_limit(body["uploadLimit"].get<int>() / 1024);
            if (body.contains("rssFeeds")) rss_worker.set_feeds(body["rssFeeds"].get<std::vector<std::string>>());
            if (body.contains("rssRules")) rss_worker.set_rules(body["rssRules"].get<std::vector<std::string>>());
            save_global_settings();
            res.set_content(global_settings.dump(), "application/json");
        } catch (const std::exception& e) {
            res.status = 400;
            res.set_content(std::string("{\"error\":\"") + e.what() + "\"}", "application/json");
        }
    });


    svr.Options("/api/settings", [&](const httplib::Request&, httplib::Response& res) {
        res.set_content("", "text/plain");
    });
}



void setup_engine_routes(httplib::Server& svr, torrent::Engine& engine);

int main() {
    std::cout << "Starting FluxTorrent Backend API..." << std::endl;

    httplib::Server svr;
    svr.new_task_queue = [] { return new httplib::ThreadPool(32); };
    g_svr = &svr;

    std::signal(SIGINT, signal_handler);
    std::signal(SIGTERM, signal_handler);
    
    torrent::Engine engine;
    engine.enable_dht_and_pex();
    torrent::SearchEngine search(engine);
    
    // Configure Jackett Load Balancer with Automated Discovery
    auto_discover_jackett(search);

    // API: Get all active torrents and their progress
    svr.Get("/api/torrents", [&](const httplib::Request&, httplib::Response& res) {
        json response = json::array();
        for (const auto& state : engine.get_all_torrent_states()) {
            std::string display_name = state.name;
            if (display_name.empty()) {
                std::lock_guard<std::mutex> lock(known_names_mutex);
                auto it = known_names.find(state.info_hash);
                if (it != known_names.end() && !it->second.empty()) {
                    display_name = it->second;
                } else {
                    display_name = "Fetching Metadata...";
                }
            }
            response.push_back({
                {"hash", state.info_hash},
                {"name", display_name},
                {"progress", state.progress * 100.0f},
                {"download_speed", state.download_rate},
                {"upload_speed", state.upload_rate},
                {"seeders", state.num_seeds},
                {"peers", state.num_peers},
                {"state", state.state}
            });
        }
        res.set_content(response.dump(), "application/json");
    });

    // API: Add a new torrent via magnet link
    svr.Post("/api/torrents", [&](const httplib::Request& req, httplib::Response& res) {
        try {
            auto body = json::parse(req.body);
            std::string magnet = body.at("magnet");
            std::string torrent_name = body.value("name", "");
            
            const char* home_env = getenv("HOME");
            std::string default_path = home_env ? std::string(home_env) + "/Downloads" : "/tmp";
            std::string base_path = body.value("save_path", default_path);
            
            // Check if it is an HTTP link instead of a magnet
            if (magnet.rfind("http://", 0) == 0 || magnet.rfind("https://", 0) == 0) {
                // Download the torrent file
                size_t host_end = magnet.find("/", 8);
                std::string host = magnet.substr(0, host_end);
                std::string path = magnet.substr(host_end);
                httplib::Client cli(host.c_str());
                
                auto dl_res = cli.Get(path.c_str());
                if (dl_res && (dl_res->status == 301 || dl_res->status == 302)) {
                    std::string loc = dl_res->get_header_value("Location");
                    if (loc.rfind("magnet:", 0) == 0) {
                        std::string hash = engine.add_magnet_link(loc, base_path);
                        if (!torrent_name.empty()) {
                            std::lock_guard<std::mutex> lock(known_names_mutex);
                            known_names[hash] = torrent_name;
                        }
                        json response = {{"status", "success"}, {"hash", hash}};
                        res.set_content(response.dump(), "application/json");
                        return;
                    }
                }
                if (dl_res && dl_res->status == 200) {
                    std::string temp_path = std::filesystem::temp_directory_path().string() + "/temp_" + std::to_string(time(nullptr)) + ".torrent";
                    std::ofstream out(temp_path, std::ios::binary);
                    out.write(dl_res->body.c_str(), dl_res->body.size());
                    out.close();
                    std::string hash = engine.add_torrent_file(temp_path, base_path);
                    std::filesystem::remove(temp_path);
                    if (!torrent_name.empty()) {
                        std::lock_guard<std::mutex> lock(known_names_mutex);
                        known_names[hash] = torrent_name;
                    }
                    json response = {{"status", "success"}, {"hash", hash}};
                    res.set_content(response.dump(), "application/json");
                    return;
                } else {
                    throw std::runtime_error("Failed to download torrent file from link");
                }
            }
            
            // Otherwise handle as standard magnet
            lt::error_code ec;
            lt::add_torrent_params params = lt::parse_magnet_uri(magnet, ec);
            if (!ec) {
                std::string target_hash = ([&](){ std::stringstream ss; ss << params.info_hashes.get_best(); return ss.str(); })();
                if (!target_hash.empty()) {
                    for (const auto& existing_hash : engine.get_active_torrents()) {
                        if (existing_hash == target_hash) {
                            res.status = 409;
                            json response = {{"status", "error"}, {"message", "Torrent already exists"}};
                            res.set_content(response.dump(), "application/json");
                            return;
                        }
                    }
                }
            }
            
            std::string hash = engine.add_magnet_link(magnet, base_path);
            if (!torrent_name.empty()) {
                std::lock_guard<std::mutex> lock(known_names_mutex);
                known_names[hash] = torrent_name;
            }
            json response = {{"status", "success"}, {"hash", hash}};
            res.set_content(response.dump(), "application/json");
        } catch (const std::exception& e) {
            res.status = 400;
            json response = {{"status", "error"}, {"message", e.what()}};
            res.set_content(response.dump(), "application/json");
        }
    });
    svr.Post("/api/torrents/file", [&](const httplib::Request& req, httplib::Response& res) {
        try {
            if (!req.has_file("file")) {
                res.status = 400;
                json response = {{"status", "error"}, {"message", "Missing 'file' in upload request"}};
                res.set_content(response.dump(), "application/json");
                return;
            }

            auto file = req.get_file_value("file");
            if (file.content.empty()) {
                res.status = 400;
                json response = {{"status", "error"}, {"message", "Uploaded file is empty"}};
                res.set_content(response.dump(), "application/json");
                return;
            }

            // Write to temporary file
            std::string temp_filename = "upload_" + std::to_string(std::chrono::high_resolution_clock::now().time_since_epoch().count()) + ".torrent";
            std::filesystem::path temp_path = std::filesystem::temp_directory_path() / temp_filename;

            {
                std::ofstream ofs(temp_path, std::ios::binary);
                if (!ofs.is_open()) {
                    throw std::runtime_error("Failed to create temporary file");
                }
                ofs.write(file.content.data(), file.content.size());
            }

            const char* home_env = getenv("HOME");
            std::string default_path = home_env ? (std::string(home_env) + "/Downloads") : "/tmp";
            std::string save_path = req.has_param("save_path") ? req.get_param_value("save_path") : default_path;

            std::string hash;
            try {
                hash = engine.add_torrent_file(temp_path.string(), save_path);
            } catch (...) {
                std::filesystem::remove(temp_path);
                throw;
            }
            std::filesystem::remove(temp_path);

            if (!file.filename.empty()) {
                std::string fname = file.filename;
                if (fname.size() > 8 && fname.substr(fname.size() - 8) == ".torrent") {
                    fname = fname.substr(0, fname.size() - 8);
                }
                std::lock_guard<std::mutex> lock(known_names_mutex);
                known_names[hash] = fname;
            }

            json response = {{{"status", "success"}}, {"hash", hash}};
            res.set_content(response.dump(), "application/json");
        } catch (const std::exception& e) {
            json response = {{"status", "error"}, {"message", e.what()}};
            res.status = 400;
            res.set_content(response.dump(), "application/json");
        }
    });

    // API: Search Jackett/DHT (SSE Stream)
    svr.Get("/api/search", [&](const httplib::Request& req, httplib::Response& res) {
        if (!req.has_param("q")) {
            res.status = 400;
            res.set_content("{\"error\": \"Missing query parameter 'q'\"}", "application/json");
            return;
        }
        std::string query = req.get_param_value("q");
        
        res.set_chunked_content_provider("text/event-stream", [query, &search](size_t offset, httplib::DataSink &sink) {
            auto search_results = search.search(query);
            for (const auto& r : search_results) {
                json item = {
                    {"name", r.name},
                    {"magnet", r.magnet_uri},
                    {"size", r.size_bytes},
                    {"seeders", r.seeders},
                    {"leechers", r.leechers},
                    {"source", r.source}
                };
                std::string sse_msg = "data: " + item.dump() + "\n\n";
                sink.write(sse_msg.c_str(), sse_msg.size());
            }
            sink.done();
            return true;
        });
    });

    // Handle CORS preflight
    svr.Options(R"(/api/.*)", [](const httplib::Request&, httplib::Response& res) {
        res.set_content("", "text/plain");
    });

    setup_engine_routes(svr, engine);
    torrent::RssWorker rss_worker(engine);
    load_global_settings(engine, rss_worker);
    rss_worker.start();
    setup_settings_routes(svr, engine, rss_worker);

    // Serve static frontend files (Support both CLI build/ folder and macOS App Resources/ folder)
    if (std::filesystem::exists("./public")) {
        svr.set_mount_point("/", "./public");
    } else {
        svr.set_mount_point("/", "../public");
    }

    int chosen_port = -1;
    for (int p = 8080; p <= 8090; ++p) {
        if (!is_port_free(p)) {
            continue;
        }
        svr.stop();
        if (svr.bind_to_port("127.0.0.1", p)) {
            chosen_port = p;
            break;
        }
    }

    if (chosen_port == -1) {
        std::cerr << "Error: All ports in range 8080-8090 are in use." << std::endl;
        exit(1);
    }

    std::ofstream port_file("/tmp/fluxtorrent_port.txt");
    if (port_file.is_open()) {
        port_file << chosen_port << std::endl;
        port_file.close();
    }

    std::cout << "Backend API & Web UI running on http://localhost:" << chosen_port << std::endl;
    svr.listen_after_bind();
    
    return 0;
}




void setup_engine_routes(httplib::Server& svr, torrent::Engine& engine) {
    svr.Get(R"(/api/stream/([^/]+)/(\d+))", [&engine](const httplib::Request& req, httplib::Response& res) {
        std::string hash = req.matches[1];
        int file_index = std::stoi(req.matches[2]);
        engine.prioritize_for_streaming(hash, file_index);
        
        auto files = engine.get_torrent_files(hash);
        if (file_index < 0 || file_index >= files.size()) {
            res.status = 404;
            return;
        }
        std::string full = files[file_index].save_path + "/" + files[file_index].path;
        
        std::string ext = full.substr(full.find_last_of(".") + 1);
        std::string mime = "video/mp4";
        if (ext == "mkv") mime = "video/x-matroska";
        else if (ext == "webm") mime = "video/webm";
        else if (ext == "mp3") mime = "audio/mpeg";
        
        res.set_file_content(full, mime);
    });

    svr.Post(R"(/api/torrents/([^/]+)/files/(\d+)/play)", [&engine](const httplib::Request& req, httplib::Response& res) {
        std::string hash = req.matches[1];
        int file_index = std::stoi(req.matches[2]);
        auto files = engine.get_torrent_files(hash);
        if (file_index >= 0 && file_index < files.size()) {
            std::string full = files[file_index].save_path + "/" + files[file_index].path;
            system(("open \"" + full + "\"").c_str());
        }
        res.set_content(R"({"status":"success"})", "application/json");
    });

    svr.Post(R"(/api/torrents/([^/]+)/pause)", [&engine](const httplib::Request& req, httplib::Response& res) {
        std::string info_hash = req.matches[1];
        engine.pause_torrent(info_hash);
        res.set_content(R"({"status":"paused"})", "application/json");
    });

    svr.Post(R"(/api/torrents/([^/]+)/resume)", [&engine](const httplib::Request& req, httplib::Response& res) {
        std::string info_hash = req.matches[1];
        engine.resume_torrent(info_hash);
        res.set_content(R"({"status":"resumed"})", "application/json");
    });

    svr.Delete(R"(/api/torrents/([^/]+))", [&engine](const httplib::Request& req, httplib::Response& res) {
        std::string info_hash = req.matches[1];
        bool delete_files = true;
        if (req.has_param("keep_files")) {
            std::string keep_files_str = req.get_param_value("keep_files");
            if (keep_files_str == "true" || keep_files_str == "1") {
                delete_files = false;
            }
        }
        engine.remove_torrent(info_hash, delete_files);
        {
            std::lock_guard<std::mutex> lock(known_names_mutex);
            known_names.erase(info_hash);
        }
        res.set_content(R"({"status":"removed"})", "application/json");
    });

    svr.Get(R"(/api/torrents/([^/]+)/files)", [&engine](const httplib::Request& req, httplib::Response& res) {
        std::string info_hash = req.matches[1];
        auto files = engine.get_torrent_files(info_hash);
        json response = json::array();
        for (const auto& f : files) {
            response.push_back({
                {"index", f.index},
                {"name", f.name},
                {"path", f.path},
                {"size", f.size},
                {"progress", f.progress},
                {"priority", f.priority}
            });
        }
        res.set_content(response.dump(), "application/json");
    });

    svr.Post(R"(/api/torrents/([^/]+)/files)", [&engine](const httplib::Request& req, httplib::Response& res) {
        std::string info_hash = req.matches[1];
        try {
            auto body = json::parse(req.body);
            std::vector<int> priorities;
            if (body.contains("priorities") && body["priorities"].is_array()) {
                for (const auto& p : body["priorities"]) {
                    priorities.push_back(p.get<int>());
                }
                engine.prioritize_files(info_hash, priorities);
            }
            res.set_content(R"({"status":"success"})", "application/json");
        } catch (const std::exception& e) {
            res.status = 400;
            res.set_content(json{{"status", "error"}, {"message", e.what()}}.dump(), "application/json");
        }
    });

    svr.Get(R"(/api/torrents/([^/]+)/peers)", [&engine](const httplib::Request& req, httplib::Response& res) {
        std::string info_hash = req.matches[1];
        auto peers = engine.get_peer_info(info_hash);
        json response = json::array();
        for (const auto& p : peers) {
            response.push_back({
                {"ip", p.ip},
                {"client", p.client},
                {"down_speed", p.down_speed},
                {"up_speed", p.up_speed},
                {"progress", p.progress}
            });
        }
        res.set_content(response.dump(), "application/json");
    });

    svr.Get(R"(/api/torrents/([^/]+)/trackers)", [&engine](const httplib::Request& req, httplib::Response& res) {
        std::string info_hash = req.matches[1];
        auto trackers = engine.get_trackers(info_hash);
        json response = json::array();
        for (const auto& t : trackers) {
            response.push_back({
                {"url", t.url},
                {"status", t.status},
                {"message", t.message}
            });
        }
        res.set_content(response.dump(), "application/json");
    });

    svr.Post(R"(/api/torrents/([^/]+)/sequential)", [&engine](const httplib::Request& req, httplib::Response& res) {
        std::string info_hash = req.matches[1];
        try {
            auto body = json::parse(req.body);
            if (body.contains("sequential")) {
                engine.set_sequential_download(info_hash, body["sequential"].get<bool>());
            }
            res.set_content(R"({"status":"success"})", "application/json");
        } catch (const std::exception& e) {
            res.status = 400;
            res.set_content(json{{"status", "error"}, {"message", e.what()}}.dump(), "application/json");
        }
    });

    svr.Post(R"(/api/torrents/([^/]+)/open_folder)", [&engine](const httplib::Request& req, httplib::Response& res) {
        std::string info_hash = req.matches[1];
        try {
            auto state = engine.get_torrent_state(info_hash);
            std::string full_path = state.save_path + "/" + state.name;
            std::string cmd = "open -R \"" + full_path + "\"";
            system(cmd.c_str());
            res.set_content(R"({"status":"success"})", "application/json");
        } catch (const std::exception& e) {
            res.status = 400;
            res.set_content(json{{"status", "error"}, {"message", e.what()}}.dump(), "application/json");
        }
    });

    svr.Post(R"(/api/torrents/([^/]+)/files/(\d+)/play_external)", [&engine](const httplib::Request& req, httplib::Response& res) {
        std::string info_hash = req.matches[1];
        int file_index = std::stoi(req.matches[2]);
        try {
            auto files = engine.get_torrent_files(info_hash);
            if (file_index >= 0 && file_index < files.size()) {
                auto state = engine.get_torrent_state(info_hash);
                std::string full_path = state.save_path + "/" + files[file_index].path;
                std::string cmd = "open -a VLC \"" + full_path + "\" || open \"" + full_path + "\"";
                system(cmd.c_str());
                res.set_content(R"({"status":"success"})", "application/json");
            } else {
                throw std::runtime_error("Invalid file index");
            }
        } catch (const std::exception& e) {
            res.status = 400;
            res.set_content(json{{"status", "error"}, {"message", e.what()}}.dump(), "application/json");
        }
    });
}
