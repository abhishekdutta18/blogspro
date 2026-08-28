#pragma once

#include <libtorrent/session.hpp>
#include <libtorrent/add_torrent_params.hpp>
#include <libtorrent/torrent_handle.hpp>
#include <libtorrent/torrent_status.hpp>
#include <string>
#include <vector>
#include <mutex>
#include <atomic>
#include <thread>

namespace torrent {

struct TorrentState {
    std::string info_hash;
    std::string name;
    std::string save_path;
    float progress; // 0.0 to 1.0
    int download_rate; // bytes per second
    int upload_rate; // bytes per second
    int num_peers;
    int num_seeds;
    std::string state;
};

class Engine {
public:
    Engine();
    ~Engine();

    std::string version() const;
    void enable_dht_and_pex();
    std::string add_torrent_file(const std::string& filepath, const std::string& save_path);
    std::string add_magnet_link(const std::string& magnet_uri, const std::string& save_path);
    std::vector<std::string> get_active_torrents() const;
    TorrentState get_torrent_state(const std::string& info_hash) const;
    std::vector<TorrentState> get_all_torrent_states() const;

    // New features:
    void pause_torrent(const std::string& info_hash);
    void resume_torrent(const std::string& info_hash);
    void remove_torrent(const std::string& info_hash, bool delete_files = true);
    void prioritize_for_streaming(const std::string& info_hash, int file_index);
    void set_download_limit(int limit_kbps);
    void set_upload_limit(int limit_kbps);
    int get_download_limit() const;
    int get_upload_limit() const;


    void save_session_state();
    void load_resume_data();

    struct FileInfo {
        int index;
        std::string name;
    std::string save_path;
        std::string path;
        long long size;
        float progress;
        int priority;
    };
    std::vector<FileInfo> get_torrent_files(const std::string& info_hash) const;
    void prioritize_files(const std::string& info_hash, const std::vector<int>& priorities);

    struct PeerInfo {
        std::string ip;
        std::string client;
        int down_speed;
        int up_speed;
        float progress;
    };
    std::vector<PeerInfo> get_peer_info(const std::string& info_hash) const;

    struct TrackerInfo {
        std::string url;
        std::string status;
        std::string message;
    };
    std::vector<TrackerInfo> get_trackers(const std::string& info_hash) const;

    void set_sequential_download(const std::string& info_hash, bool sequential);

    void set_proxy(int proxy_type, const std::string& hostname, int port);
    void set_encryption(bool require_encryption);
    void set_listen_interfaces(const std::string& interfaces);
    int get_proxy_type() const;
    bool get_require_encryption() const;
    std::string get_listen_interfaces() const;
    void poll_alerts_loop();

private:
    std::string hash_to_string(const lt::info_hash_t& ih) const;

    mutable std::mutex mutex_;
    lt::session session_;
    std::atomic<bool> running_;
    std::thread alert_thread_;
};

} // namespace torrent
