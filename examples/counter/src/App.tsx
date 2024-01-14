import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import automergeLogo from './assets/automerge.png'
import tauriLogo from './assets/tauri.png'
import './App.css'
import {AutomergeUrl} from '@automerge/automerge-repo'
import {useDocument} from '@automerge/automerge-repo-react-hooks'
import {next as A} from "@automerge/automerge"

interface CounterDoc {
  counter: A.Counter
}

function App({docUrl}: {docUrl: AutomergeUrl}) {
  const [doc, changeDoc] = useDocument<CounterDoc>(docUrl)

  return (
    <>
      <div>
        <a href="https://vitejs.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
	<a href="https://automerge.org" target="_blank">
	  <img src={automergeLogo} className="logo automerge" alt="Automerge logo" />
	</a>
	<a href="https://tauri.app" target="_blank">
	  <img src={tauriLogo} className="logo tauri" alt="Automerge logo" />
	</a>
      </div>
      <h1>Vite + React + Automerge + Tauri</h1>
      <h2>Showing<pre>{docUrl}</pre></h2>
      <div className="card">
	<button onClick={() => changeDoc((d) => d.counter.increment(1))}>
          count is { doc && doc.counter.value }
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
    </>
  )
}

export default App
