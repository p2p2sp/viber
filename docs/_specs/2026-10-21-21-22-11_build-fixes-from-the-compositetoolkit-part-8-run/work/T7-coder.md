# T7 coder notes

- The owner file lists directories (the linked dir and each @scope dir, recorded before mkdir), not single links: cleanup and reclaim (`drop_links`) unlink every link entry of a listed real directory, so a link made right before a signal is always found. A listed link (older whole-directory format) or a single entry line still works; a listed path with a link among its parents is skipped so a scan never runs inside the main tree.
- Windows was not run here: links are one `mklink /J` batch (`$tmp/mklink.cmd`), removal one `rmdir` batch (`rmlinks.cmd`), file entries copied (a junction holds only a directory). The batch name keeps the `*mklink*` match of the test stubs. Relies on MSYS reporting a junction as `-L`; the batch holds `chcp 65001` for non-ASCII names.
- The mtime test failed on macOS before any change: bash 3.2's `-nt` compares whole seconds, so the red and control runs landing in one second looked unchanged. Its fixture now compares with `find -newer`.
- The TERM test is now cross-platform: on POSIX an `ln` stub sends TERM only after a link inside `wt/node_modules/`, which makes it fail on the whole-directory version.
