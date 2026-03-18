const SERVER_KEY = "marketview_server_url";
const DEFAULT_URL = "https://market-view-jcv5.onrender.com";

const urlInput = document.getElementById("server-url");
const sendBtn = document.getElementById("send-btn");
const statusEl = document.getElementById("status");

// Load saved server URL
chrome.storage.local.get(SERVER_KEY, (data) => {
  urlInput.value = data[SERVER_KEY] || DEFAULT_URL;
});

// Save URL on change
urlInput.addEventListener("change", () => {
  chrome.storage.local.set({ [SERVER_KEY]: urlInput.value.trim() });
});

sendBtn.addEventListener("click", async () => {
  const serverUrl = urlInput.value.trim().replace(/\/+$/, "");
  if (!serverUrl) {
    statusEl.className = "error";
    statusEl.textContent = "Enter your Market View dashboard URL";
    return;
  }

  // Save URL for next time
  chrome.storage.local.set({ [SERVER_KEY]: serverUrl });

  sendBtn.disabled = true;
  statusEl.className = "info";
  statusEl.textContent = "Reading cookies...";

  try {
    // Get all relevant cookies
    const [hxCookies, cfAccessCookies, cfCookies] = await Promise.all([
      chrome.cookies.getAll({ domain: "holidayextras.com" }),
      chrome.cookies.getAll({ domain: "cloudflareaccess.com" }),
      chrome.cookies.getAll({ domain: "cloudflare.com" }),
    ]);

    const allCookies = [...hxCookies, ...cfAccessCookies, ...cfCookies];

    if (allCookies.length === 0) {
      statusEl.className = "error";
      statusEl.textContent = "No cookies found. Sign into the Rate Checker first.";
      sendBtn.disabled = false;
      return;
    }

    // Convert to Playwright cookie format
    const cookies = allCookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expirationDate || -1,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite === "no_restriction" ? "None" : c.sameSite === "lax" ? "Lax" : "Strict",
    }));

    statusEl.textContent = `Sending ${cookies.length} cookies...`;

    const res = await fetch(`${serverUrl}/api/hx-cookies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cookies }),
    });

    const data = await res.json();

    if (res.ok) {
      statusEl.className = "success";
      statusEl.textContent = `Done! ${data.cookieCount} cookies saved.`;
    } else {
      statusEl.className = "error";
      statusEl.textContent = data.error || "Server error";
    }
  } catch (err) {
    statusEl.className = "error";
    statusEl.textContent = `Failed: ${err.message}`;
  } finally {
    sendBtn.disabled = false;
  }
});
