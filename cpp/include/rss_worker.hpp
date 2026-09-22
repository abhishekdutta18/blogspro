#pragma once

#include "engine.hpp"
#include <vector>
#include <string>
#include <thread>
#include <atomic>
#include <mutex>
#include <set>

namespace torrent {

class RssWorker {
public:
    RssWorker(Engine& engine);
    ~RssWorker();

    void set_feeds(const std::vector<std::string>& feeds);
    void set_rules(const std::vector<std::string>& rules);

    void start();
    void stop();

private:
    void loop();
    void load_history();
    void save_history();
    bool check_feed(const std::string& url);

    Engine& engine_;
    std::vector<std::string> feeds_;
    std::vector<std::string> rules_;
    std::set<std::string> downloaded_links_;

    std::thread thread_;
    std::atomic<bool> running_;
    std::mutex mutex_;
};

} // namespace torrent
