cmake_minimum_required(VERSION 3.14)
project(TorrentDownloader CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include_directories(include)

include(FetchContent)
FetchContent_Declare(
  Catch2
  GIT_REPOSITORY https://github.com/catchorg/Catch2.git
  GIT_TAG        v3.4.0
)
FetchContent_MakeAvailable(Catch2)

# Find libtorrent-rasterbar installed by Homebrew
find_package(LibtorrentRasterbar REQUIRED)
find_package(OpenSSL REQUIRED)

add_library(torrent_engine src/engine.cpp src/rss_worker.cpp src/search.cpp)
target_link_libraries(torrent_engine PUBLIC LibtorrentRasterbar::torrent-rasterbar OpenSSL::SSL OpenSSL::Crypto)

if(APPLE)
    target_link_libraries(torrent_engine PUBLIC "-framework CoreFoundation" "-framework Security")
endif()

target_include_directories(torrent_engine PUBLIC include)
target_compile_definitions(torrent_engine PUBLIC CPPHTTPLIB_OPENSSL_SUPPORT)

add_executable(torrent_client src/main.cpp)
target_link_libraries(torrent_client PRIVATE torrent_engine)

add_executable(torrent_tests tests/test_engine.cpp tests/test_search.cpp)
target_link_libraries(torrent_tests PRIVATE torrent_engine Catch2::Catch2WithMain)

include(CTest)
include(Catch)
catch_discover_tests(torrent_tests)
