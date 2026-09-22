#include "rss_worker.hpp"
#include <httplib.h>
#include <regex>
#include <fstream>
#include <iostream>
#include <chrono>

namespace torrent {

RssWorker::RssWorker(Engine& engine) : engine_(engine), running_(false) {
    load_history();
}

RssWorker::~RssWorker() {
    stop();
}

void RssWorker::set_feeds(const std::vector<std::string>& feeds) {
    std::lock_guard<std::mutex> lock(mutex_);
    feeds_ = feeds;
}

void RssWorker::set_rules(const std::vector<std::string>& rules) {
    std::lock_guard<std::mutex> lock(mutex_);
    rules_ = rules;
}

void RssWorker::start() {
    if (running_) return;
    running_ = true;
    thread_ = std::thread(&RssWorker::loop, this);
}

void RssWorker::stop() {
    running_ = false;
    if (thread_.joinable()) {
        thread_.join();
    }
}

void RssWorker::load_history() {
    std::string home = getenv("HOME") ? getenv("HOME") : "/tmp";
    std::ifstream file(home + "/.fluxtorrent/rss_history.txt");
    std::string line;
    while (std::getline(file, line)) {
        if (!line.empty()) downloaded_links_.insert(line);
    }
}

void RssWorker::save_history() {
    std::string home = getenv("HOME") ? getenv("HOME") : "/tmp";
    std::ofstream file(home + "/.fluxtorrent/rss_history.txt");
    for (const auto& link : downloaded_links_) {
        file << link << "\n";
    }
}

void RssWorker::loop() {
    while (running_) {
        std::vector<std::string> current_feeds;
        std::vector<std::string> current_rules;
        {
            std::lock_guard<std::mutex> lock(mutex_);
            current_feeds = feeds_;
            current_rules = rules_;
        }

        bool history_changed = false;

        for (const auto& feed_url : current_feeds) {
            if (!running_) break;
            
            httplib::Client cli(feed_url);
            cli.set_follow_location(true);
            auto res = cli.Get("/");
            if (res && res->status == 200) {
                std::string body = res->body;
                std::regex item_regex(R"(<item>.*?<title>(.*?)</title>.*?<link>(.*?)</link>.*?</item>)", std::regex::icase | std::regex::optimize);
                auto items_begin = std::sregex_iterator(body.begin(), body.end(), item_regex);
                auto items_end = std::sregex_iterator();

                for (std::sregex_iterator i = items_begin; i != items_end; ++i) {
                    std::smatch match = *i;
                    std::string title = match[1].str();
                    std::string link = match[2].str();

                    if (downloaded_links_.count(link) > 0) continue;

                    for (const auto& rule : current_rules) {
                        try {
                            std::regex rule_regex(rule, std::regex::icase);
                            if (std::regex_search(title, rule_regex)) {
                                std::cout << "RSS match found: " << title << " -> " << link << std::endl;
                                engine_.add_magnet_link(link, ""); // Empty save path means default
                                downloaded_links_.insert(link);
                                history_changed = true;
                                break;
                            }
                        } catch (const std::regex_error&) {
                            std::cerr << "Invalid regex rule: " << rule << std::endl;
                        }
                    }
                }
            }
        }

        if (history_changed) {
            save_history();
        }

        for (int i = 0; i < 600 && running_; ++i) {
            std::this_thread::sleep_for(std::chrono::seconds(1));
        }
    }
}

} // namespace torrent
