import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { isValidAutomergeUrl, Repo } from '@automerge/automerge-repo'
import { BroadcastChannelNetworkAdapter } from '@automerge/automerge-repo-network-broadcastchannel'
//import { TauriFileSystemStorageAdapter } from "@jcc333/automerge-repo-storage-taurifs"
import {next as A} from "@automerge/automerge"
import { RepoContext } from '@automerge/automerge-repo-react-hooks'
import * as path from "@tauri-apps/api/path"
import * as fs from "@tauri-apps/api/fs"
import { TauriFileSystemStorageAdapter } from "@jcc333/automerge-repo-storage-taurifs"


const appDir = await path.appDir()
const repoDir = await path.resolve(appDir, "counter-repo-data")
await fs.createDir(repoDir, { recursive: true })

const repo = new Repo({
    network: [new BroadcastChannelNetworkAdapter()],
    storage: new TauriFileSystemStorageAdapter(repoDir),
})

const rootDocUrl = `${document.location.hash.substr(1)}`
const isValid = isValidAutomergeUrl(rootDocUrl)
const handle = isValid ? repo.find(rootDocUrl) : repo.create<{counter?: A.Counter}>();

if (!isValid) {
    handle.change(d => d.counter = new A.Counter())
}


const docUrl = document.location.hash = handle.url
// @ts-ignore
window.handle = handle // we'll use this later for experimentation

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RepoContext.Provider value={repo}>
      <App docUrl={docUrl}/>
    </RepoContext.Provider>
  </React.StrictMode>,
)
