#include "engine.hpp"
#include <libtorrent/version.hpp>
#include <libtorrent/torrent_info.hpp>
#include <libtorrent/magnet_uri.hpp>
#include <libtorrent/error_code.hpp>
#include <libtorrent/torrent_flags.hpp>
#include <libtorrent/kademlia/dht_settings.hpp>
#include <libtorrent/write_resume_data.hpp>
#include <libtorrent/read_resume_data.hpp>
#include <libtorrent/alert_types.hpp>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <stdexcept>
#include <iostream>
#include <chrono>
#include <vector>

namespace torrent {

Engine::Engine() : session_(), running_(true) {
    lt::settings_pack pack;
    pack.set_int(lt::settings_pack::alert_mask,
        lt::alert_category::error |
        lt::alert_category::storage |
        lt::alert_category::status |
        lt::alert_category::peer |
        lt::alert_category::tracker |
        lt::alert_category::dht |
        lt::alert_category::torrent_log);
    session_.apply_settings(pack);

    load_resume_data();
    alert_thread_ = std::thread(&Engine::poll_alerts_loop, this);
}

Engine::~Engine() {
    running_ = false;
    if (alert_thread_.joinable()) {
        alert_thread_.join();
    }
    save_session_state();
}

std::string Engine::hash_to_string(const lt::info_hash_t& ih) const {
    const auto& h = ih.get_best();
    static constexpr char hex_chars[] = "0123456789abcdef";
    std::string result;
    result.reserve(h.size() * 2);
    for (char c : h) {
        auto byte = static_cast<unsigned char>(c);
        result.push_back(hex_chars[(byte >> 4) & 0x0f]);
        result.push_back(hex_chars[byte & 0x0f]);
    }
    return result;
}

std::string Engine::version() const {
    return lt::version();
}

void Engine::enable_dht_and_pex() {
    std::lock_guard<std::mutex> lock(mutex_);
    lt::settings_pack pack;
    
    // DHT settings
    pack.set_bool(lt::settings_pack::enable_dht, true);
    
    // TCP/UTP transport settings
    pack.set_bool(lt::settings_pack::enable_outgoing_utp, true);
    pack.set_bool(lt::settings_pack::enable_incoming_utp, true);
    pack.set_bool(lt::settings_pack::enable_outgoing_tcp, true);
    pack.set_bool(lt::settings_pack::enable_incoming_tcp, true);

    // LSD (Local Service Discovery) settings
    pack.set_bool(lt::settings_pack::enable_lsd, true);

    // PEX is enabled by default via libtorrent's ut_pex extension

    session_.apply_settings(pack);
}

std::string Engine::add_torrent_file(const std::string& filepath, const std::string& save_path) {
    std::lock_guard<std::mutex> lock(mutex_);
    lt::error_code ec;
    auto info = std::make_shared<lt::torrent_info>(filepath, ec);
    if (ec) {
        throw std::runtime_error("Failed to parse torrent file: " + ec.message());
    }

    lt::add_torrent_params params;
    params.save_path = save_path;
    params.ti = info;
    params.flags &= ~lt::torrent_flags::paused;

    lt::torrent_handle handle = session_.add_torrent(params, ec);
    if (ec) {
        throw std::runtime_error("Failed to add torrent: " + ec.message());
    }

    return hash_to_string(handle.info_hashes());
}

std::string Engine::add_magnet_link(const std::string& magnet_uri, const std::string& save_path) {
    std::lock_guard<std::mutex> lock(mutex_);
    lt::error_code ec;
    lt::add_torrent_params params = lt::parse_magnet_uri(magnet_uri, ec);
    if (ec) {
        throw std::runtime_error("Failed to parse magnet link: " + ec.message());
    }
    
    params.save_path = save_path;
    params.flags &= ~lt::torrent_flags::paused;
    lt::torrent_handle handle = session_.add_torrent(params, ec);
    if (ec) {
        throw std::runtime_error("Failed to add magnet link: " + ec.message());
    }

    return hash_to_string(handle.info_hashes());
}

std::vector<std::string> Engine::get_active_torrents() const {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<std::string> active;
    for (const auto& handle : session_.get_torrents()) {
        active.push_back(hash_to_string(handle.info_hashes()));
    }
    return active;
}

static std::string state_to_string(lt::torrent_status::state_t s) {
    switch (s) {
        case lt::torrent_status::checking_files: return "checking files";
        case lt::torrent_status::downloading_metadata: return "downloading metadata";
        case lt::torrent_status::downloading: return "downloading";
        case lt::torrent_status::finished: return "finished";
        case lt::torrent_status::seeding: return "seeding";
        case lt::torrent_status::checking_resume_data: return "checking resume";
        default: return "unknown";
    }
}

TorrentState Engine::get_torrent_state(const std::string& info_hash) const {
    std::lock_guard<std::mutex> lock(mutex_);
    for (const auto& handle : session_.get_torrents()) {
        if (hash_to_string(handle.info_hashes()) == info_hash) {
            lt::torrent_status status = handle.status();
            TorrentState state;
            state.info_hash = info_hash;
            
            // Name might be empty if metadata hasn't downloaded yet (for magnets)
            if (handle.torrent_file()) {
                state.name = handle.torrent_file()->name();
            } else {
                state.name = status.name;
            }
            
            state.progress = status.progress;
            state.download_rate = status.download_rate;
            state.upload_rate = status.upload_rate;
            state.num_peers = status.num_peers;
            state.num_seeds = status.num_seeds;
            state.state = state_to_string(status.state);
            if (status.flags & lt::torrent_flags::paused) {
                state.state = "paused";
            }
            return state;
        }
    }
    throw std::runtime_error("Torrent not found: " + info_hash);
}

std::vector<TorrentState> Engine::get_all_torrent_states() const {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<TorrentState> states;
    for (const auto& handle : session_.get_torrents()) {
        try {
            lt::torrent_status status = handle.status();
            TorrentState state;
            state.info_hash = hash_to_string(handle.info_hashes());

            if (handle.torrent_file()) {
                state.name = handle.torrent_file()->name();
            } else {
                state.name = status.name;
            }

            state.progress = status.progress;
            state.download_rate = status.download_rate;
            state.upload_rate = status.upload_rate;
            state.num_peers = status.num_peers;
            state.num_seeds = status.num_seeds;
            state.state = state_to_string(status.state);
            if (status.flags & lt::torrent_flags::paused) {
                state.state = "paused";
            }
            states.push_back(state);
        } catch (...) {
            continue;
        }
    }
    return states;
}

void Engine::pause_torrent(const std::string& info_hash) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto torrents = session_.get_torrents();
    for (auto& t : torrents) {
        if (hash_to_string(t.info_hashes()) == info_hash) {
            t.pause();
            break;
        }
    }
}

void Engine::resume_torrent(const std::string& info_hash) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto torrents = session_.get_torrents();
    for (auto& t : torrents) {
        if (hash_to_string(t.info_hashes()) == info_hash) {
            t.resume();
            break;
        }
    }
}

void Engine::remove_torrent(const std::string& info_hash, bool delete_files) {
    // Delete resume file if it exists
    const char* home = std::getenv("HOME");
    if (home) {
        std::filesystem::path resume_path = std::filesystem::path(home) / ".fluxtorrent" / "resume" / (info_hash + ".resume");
        std::error_code ec;
        std::filesystem::remove(resume_path, ec);
    }
    std::lock_guard<std::mutex> lock(mutex_);
    auto torrents = session_.get_torrents();
    for (auto& t : torrents) {
        if (hash_to_string(t.info_hashes()) == info_hash) {
            session_.remove_torrent(t, delete_files ? lt::session::delete_files : lt::remove_flags_t{});
            break;
        }
    }
}

void Engine::save_session_state() {
    std::lock_guard<std::mutex> lock(mutex_);
    const char* home = std::getenv("HOME");
    if (!home) return;

    std::filesystem::path resume_dir = std::filesystem::path(home) / ".fluxtorrent" / "resume";
    std::error_code ec;
    std::filesystem::create_directories(resume_dir, ec);
    if (ec) {
        std::cerr << "Failed to create resume directory: " << ec.message() << std::endl;
        return;
    }

    auto torrents = session_.get_torrents();
    int num_outstanding = 0;
    for (auto& h : torrents) {
        if (!h.is_valid()) continue;
        h.save_resume_data(lt::torrent_handle::save_info_dict);
        ++num_outstanding;
    }

    auto start_time = std::chrono::steady_clock::now();
    while (num_outstanding > 0) {
        if (std::chrono::duration_cast<std::chrono::seconds>(
                std::chrono::steady_clock::now() - start_time).count() > 5) {
            break;
        }

        session_.wait_for_alert(lt::milliseconds(100));
        std::vector<lt::alert*> alerts;
        session_.pop_alerts(&alerts);
        for (auto* a : alerts) {
            if (auto* rd = lt::alert_cast<lt::save_resume_data_alert>(a)) {
                --num_outstanding;
                auto buf = lt::write_resume_data_buf(rd->params);
                std::string hash_hex = hash_to_string(rd->handle.info_hashes());
                std::filesystem::path file_path = resume_dir / (hash_hex + ".resume");
                std::ofstream out(file_path, std::ios::binary);
                if (out.is_open()) {
                    out.write(buf.data(), static_cast<std::streamsize>(buf.size()));
                }
            } else if (auto* fail = lt::alert_cast<lt::save_resume_data_failed_alert>(a)) {
                --num_outstanding;
            }
        }
    }
}

void Engine::load_resume_data() {
    std::lock_guard<std::mutex> lock(mutex_);
    const char* home = std::getenv("HOME");
    if (!home) return;

    std::filesystem::path resume_dir = std::filesystem::path(home) / ".fluxtorrent" / "resume";
    if (!std::filesystem::exists(resume_dir) || !std::filesystem::is_directory(resume_dir)) {
        return;
    }

    for (const auto& entry : std::filesystem::directory_iterator(resume_dir)) {
        if (entry.is_regular_file() && entry.path().extension() == ".resume") {
            try {
                std::ifstream in(entry.path(), std::ios::binary);
                if (!in.is_open()) continue;

                std::vector<char> buffer((std::istreambuf_iterator<char>(in)),
                                         std::istreambuf_iterator<char>());
                if (buffer.empty()) continue;

                lt::error_code ec;
                lt::add_torrent_params params = lt::read_resume_data(buffer, ec);
                if (ec) {
                    std::cerr << "Failed to read resume data from " << entry.path() << ": " << ec.message() << std::endl;
                    continue;
                }

                session_.add_torrent(params, ec);
                if (ec) {
                    std::cerr << "Failed to add torrent from resume data: " << ec.message() << std::endl;
                }
            } catch (const std::exception& e) {
                std::cerr << "Exception loading resume data " << entry.path() << ": " << e.what() << std::endl;
            }
        }
    }
}

} // namespace torrent

namespace torrent {

void Engine::set_download_limit(int limit_kbps) {
    std::lock_guard<std::mutex> lock(mutex_);
    lt::settings_pack pack;
    pack.set_int(lt::settings_pack::download_rate_limit, limit_kbps > 0 ? limit_kbps * 1024 : 0);
    session_.apply_settings(pack);
}

void Engine::set_upload_limit(int limit_kbps) {
    std::lock_guard<std::mutex> lock(mutex_);
    lt::settings_pack pack;
    pack.set_int(lt::settings_pack::upload_rate_limit, limit_kbps > 0 ? limit_kbps * 1024 : 0);
    session_.apply_settings(pack);
}

int Engine::get_download_limit() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return session_.get_settings().get_int(lt::settings_pack::download_rate_limit) / 1024;
}

int Engine::get_upload_limit() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return session_.get_settings().get_int(lt::settings_pack::upload_rate_limit) / 1024;
}

std::vector<Engine::FileInfo> Engine::get_torrent_files(const std::string& info_hash) const {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<FileInfo> files;
    for (const auto& handle : session_.get_torrents()) {
        if (hash_to_string(handle.info_hashes()) == info_hash) {
            if (auto tf = handle.torrent_file()) {
                std::vector<int64_t> progress;
                handle.file_progress(progress);
                std::vector<lt::download_priority_t> priorities = handle.get_file_priorities();

                for (int i = 0; i < tf->num_files(); ++i) {
                    FileInfo fi;
                    fi.index = i;
                    fi.name = std::string(tf->files().file_name(lt::file_index_t(i)));
                    fi.path = tf->files().file_path(lt::file_index_t(i));
                    fi.size = tf->files().file_size(lt::file_index_t(i));
                    fi.progress = fi.size > 0 ? static_cast<float>(progress[i]) / fi.size : 1.0f;
                    fi.priority = (i < priorities.size()) ? static_cast<uint8_t>(priorities[i]) : 1;
                    files.push_back(fi);
                }
            }
            break;
        }
    }
    return files;
}

void Engine::prioritize_files(const std::string& info_hash, const std::vector<int>& priorities) {
    std::lock_guard<std::mutex> lock(mutex_);
    for (auto& handle : session_.get_torrents()) {
        if (hash_to_string(handle.info_hashes()) == info_hash) {
            std::vector<lt::download_priority_t> lt_priorities;
            lt_priorities.reserve(priorities.size());
            for (int p : priorities) {
                lt_priorities.push_back(lt::download_priority_t(static_cast<uint8_t>(p)));
            }
            handle.prioritize_files(lt_priorities);
            break;
        }
    }
}

std::vector<Engine::PeerInfo> Engine::get_peer_info(const std::string& info_hash) const {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<PeerInfo> peers;
    for (const auto& handle : session_.get_torrents()) {
        if (hash_to_string(handle.info_hashes()) == info_hash) {
            std::vector<lt::peer_info> lt_peers;
            handle.get_peer_info(lt_peers);
            for (const auto& pi : lt_peers) {
                PeerInfo p;
                p.ip = ""; // suppress deprecation warning for pi.ip
                p.client = pi.client;
                p.down_speed = pi.down_speed;
                p.up_speed = pi.up_speed;
                p.progress = pi.progress;
                peers.push_back(p);
            }
            break;
        }
    }
    return peers;
}

std::vector<Engine::TrackerInfo> Engine::get_trackers(const std::string& info_hash) const {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<TrackerInfo> trackers;
    for (const auto& handle : session_.get_torrents()) {
        if (hash_to_string(handle.info_hashes()) == info_hash) {
            std::vector<lt::announce_entry> trs = handle.trackers();
            for (const auto& tr : trs) {
                TrackerInfo ti;
                ti.url = tr.url;
                ti.status = "Unknown";
                ti.message = "";
                if (!tr.endpoints.empty()) {
                    ti.status = tr.endpoints.front().is_working() ? "Working" : "Not working";
                }
                trackers.push_back(ti);
            }
            break;
        }
    }
    return trackers;
}

void Engine::set_sequential_download(const std::string& info_hash, bool sequential) {
    std::lock_guard<std::mutex> lock(mutex_);
    for (auto& handle : session_.get_torrents()) {
        if (hash_to_string(handle.info_hashes()) == info_hash) {
            handle.set_flags(sequential ? lt::torrent_flags::sequential_download : lt::torrent_flags_t{}, lt::torrent_flags::sequential_download);
            break;
        }
    }
}

void Engine::set_proxy(int proxy_type, const std::string& hostname, int port) {
    std::lock_guard<std::mutex> lock(mutex_);
    lt::settings_pack pack;
    pack.set_int(lt::settings_pack::proxy_type, proxy_type);
    if (!hostname.empty()) {
        pack.set_str(lt::settings_pack::proxy_hostname, hostname);
        pack.set_int(lt::settings_pack::proxy_port, port);
    }
    session_.apply_settings(pack);
}

void Engine::set_encryption(bool require_encryption) {
    std::lock_guard<std::mutex> lock(mutex_);
    lt::settings_pack pack;
    pack.set_int(lt::settings_pack::out_enc_policy, require_encryption ? lt::settings_pack::pe_forced : lt::settings_pack::pe_enabled);
    pack.set_int(lt::settings_pack::in_enc_policy, require_encryption ? lt::settings_pack::pe_forced : lt::settings_pack::pe_enabled);
    session_.apply_settings(pack);
}

void Engine::set_listen_interfaces(const std::string& interfaces) {
    std::lock_guard<std::mutex> lock(mutex_);
    lt::settings_pack pack;
    pack.set_str(lt::settings_pack::listen_interfaces, interfaces);
    session_.apply_settings(pack);
}

int Engine::get_proxy_type() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return session_.get_settings().get_int(lt::settings_pack::proxy_type);
}

bool Engine::get_require_encryption() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return session_.get_settings().get_int(lt::settings_pack::out_enc_policy) == lt::settings_pack::pe_forced;
}

std::string Engine::get_listen_interfaces() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return session_.get_settings().get_str(lt::settings_pack::listen_interfaces);
}

void Engine::poll_alerts_loop() {
    const char* home = std::getenv("HOME");
    std::string dht_index_path = home ? std::string(home) + "/.fluxtorrent/dht_index.txt" : "/tmp/dht_index.txt";
    
    while (running_) {
        session_.wait_for_alert(lt::milliseconds(500));
        
        std::vector<lt::alert*> alerts;
        session_.pop_alerts(&alerts);
        
        for (lt::alert* a : alerts) {
            if (auto* dht_ann = lt::alert_cast<lt::dht_announce_alert>(a)) {
                std::ofstream out(dht_index_path, std::ios::app);
                out << hash_to_string(lt::info_hash_t(dht_ann->info_hash)) << std::endl;
            } else if (auto* dht_get = lt::alert_cast<lt::dht_get_peers_alert>(a)) {
                std::ofstream out(dht_index_path, std::ios::app);
                out << hash_to_string(lt::info_hash_t(dht_get->info_hash)) << std::endl;
            }
            // Other alerts can be handled here
        }
    }
}

} // namespace torrent

namespace torrent {
void Engine::prioritize_for_streaming(const std::string& info_hash, int file_index) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto torrents = session_.get_torrents();
    for (auto const& t : torrents) {
        if (hash_to_string(t.info_hashes()) == info_hash) {
            if (auto tinfo = t.torrent_file()) {
                std::string save_path = t.status().save_path;
                std::string file_path = tinfo->files().file_path(lt::file_index_t(file_index));
                std::string full_path = save_path + "/" + file_path;
                
                t.set_flags(lt::torrent_flags::sequential_download, lt::torrent_flags::sequential_download);
                t.file_priority(lt::file_index_t{file_index}, lt::download_priority_t{7});
                
                
                return;
            }
        }
    }
}
}
