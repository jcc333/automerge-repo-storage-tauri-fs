# Whatever Plausibly Reusable Components I Make for Tauri and Automerge

I'm tinkering a lot with [Tauri](https://tauri.app/) and [Automerge-Repo](https://automerge.org/blog/2023/11/06/automerge-repo/) lately.

They're a relatively good pair since they both combine local applications, rust, and web technologies.

However, automerge-repo by default focuses on browser technologies and/or Node.js, meaning that the limited e.g. filesystem access from [@tauri-apps/api](https://www.npmjs.com/package/@tauri-apps/api) can be a problem.

Or an opportunity - here's initially a `'@tauri-apps/api/fs'`, `@tauri-apps/api/path`, and `@tauri-apps/api/os`-using WIP `StorageAdapter` (largely a 1:1 copy from [NodeFSStorageAdapter](https://automerge.org/automerge-repo/classes/_automerge_automerge_repo_storage_nodefs.NodeFSStorageAdapter.html#constructor) and the missing `relative` function from node's [path module](https://github.com/nodejs/node/blob/main/lib/path.js).)

## Usage for `TauriFileSystemStorageAdapter`

To work, `TauriFileSystemStorageAdapter` needs the following modules properly set up within `tauri.conf.json`:

* `fs`
* `path`
* `os`
