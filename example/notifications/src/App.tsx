import { useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import { NotificationsComponent, setCustomHost } from "bitsnap-react";
import "./App.css";

function App() {
  const [count, setCount] = useState(0);
  setCustomHost("http://localhost:4321");
  return (
    <div className="bg-neutral-100">
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo text-red-500" alt="Vite logo" />
        </a>
        <p className="text-blue-500">Hello World</p>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1 className="text-blue-500">Vite + React</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <NotificationsComponent
        slug="DX"
        showPhoneInput={true}
        isManaging={true}
        showQRCode={true}
      />
    </div>
  );
}

export default App;
