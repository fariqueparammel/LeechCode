const form = document.querySelector("#composer");
const input = document.querySelector("[data-webchat-input]");
const conversation = document.querySelector("#conversation");

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const prompt = input.value.trim();

  if (!prompt) {
    return;
  }

  addMessage("user", prompt);
  input.value = "";
  streamAssistantResponse();
});

function addMessage(kind, text) {
  const message = document.createElement("article");
  message.className = `message ${kind}`;
  message.textContent = text;

  if (kind === "assistant") {
    message.dataset.webchatAssistant = "true";
    message.dataset.messageAuthorRole = "assistant";
  }

  conversation.append(message);
  return message;
}

function streamAssistantResponse() {
  const assistant = addMessage("assistant", "");
  const response = [
    "I created a small local web app through the WebChat agent protocol.\n\n",
    "<webchat_agent_response>\n",
    JSON.stringify(buildAgentResponse(), null, 2),
    "\n</webchat_agent_response>"
  ].join("");
  let index = 0;
  const timer = setInterval(() => {
    assistant.textContent += response.slice(index, index + 90);
    index += 90;

    if (index >= response.length) {
      clearInterval(timer);
    }
  }, 35);
}

function buildAgentResponse() {
  return {
    summary: "Created a simple generated web app with HTML, CSS, and JavaScript under demo/generated-web-app.",
    files: [
      {
        path: "demo/generated-web-app/index.html",
        action: "write",
        content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>WebChat Generated App</title>
    <link rel="stylesheet" href="./style.css">
  </head>
  <body>
    <main class="app">
      <section class="panel">
        <p class="eyebrow">Built through WebChat</p>
        <h1>Focus Sprint</h1>
        <p class="lede">A tiny browser app for planning one short work sprint.</p>
        <form id="task-form">
          <input id="task-input" type="text" placeholder="Add a task" autocomplete="off">
          <button type="submit">Add</button>
        </form>
        <ul id="task-list" aria-live="polite"></ul>
      </section>
    </main>
    <script src="./app.js"></script>
  </body>
</html>
`
      },
      {
        path: "demo/generated-web-app/style.css",
        action: "write",
        content: `:root {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #1f2933;
  background: #f4f7f5;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

.app {
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 28px;
}

.panel {
  width: min(680px, 100%);
  border: 1px solid #d8ddd6;
  border-radius: 8px;
  background: #ffffff;
  padding: 28px;
  box-shadow: 0 18px 45px rgba(31, 41, 51, 0.08);
}

.eyebrow {
  color: #2f7d69;
  font-size: 13px;
  font-weight: 700;
  margin: 0 0 8px;
  text-transform: uppercase;
}

h1 {
  font-size: 34px;
  margin: 0;
}

.lede {
  color: #59636e;
  margin: 10px 0 22px;
}

form {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
}

input,
button {
  border-radius: 8px;
  font: inherit;
  min-height: 44px;
}

input {
  border: 1px solid #cbd3ce;
  padding: 0 12px;
}

button {
  border: 0;
  background: #146c5f;
  color: #ffffff;
  font-weight: 700;
  padding: 0 18px;
}

ul {
  display: grid;
  gap: 8px;
  list-style: none;
  margin: 20px 0 0;
  padding: 0;
}

li {
  border: 1px solid #e1e5e0;
  border-radius: 8px;
  padding: 10px 12px;
}
`
      },
      {
        path: "demo/generated-web-app/app.js",
        action: "write",
        content: `const form = document.querySelector("#task-form");
const input = document.querySelector("#task-input");
const list = document.querySelector("#task-list");

const tasks = ["Choose one outcome", "Set a 25 minute timer", "Review what changed"];

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const task = input.value.trim();

  if (!task) {
    return;
  }

  tasks.push(task);
  input.value = "";
  render();
});

function render() {
  list.replaceChildren(...tasks.map((task) => {
    const item = document.createElement("li");
    item.textContent = task;
    return item;
  }));
}

render();
`
      }
    ],
    nextSteps: ["Open demo/generated-web-app/index.html in a browser."]
  };
}
