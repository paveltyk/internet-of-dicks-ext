chrome.action.onClicked.addListener(async (tab) => {
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: toggleDrawCanvas,
  });

  const isActive = result[0].result;

  chrome.action.setIcon({
    tabId: tab.id,
    path: isActive ? "icon-active.png" : "icon.png",
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "deactivateIcon") {
    chrome.action.setIcon({
      tabId: sender.tab.id,
      path: "icon.png",
    });
  }
});

function toggleDrawCanvas() {
  if (!window.ws) {
    window.socketRef = 1;
    window.ws = new WebSocket("wss://dicks-phx.fly.dev/socket/websocket");

    window.ws.onopen = () => {
      window.ws.send(
        JSON.stringify({
          topic: "draw:lobby",
          event: "phx_join",
          ref: String(window.socketRef++),
          payload: {},
        }),
      );
    };

    window.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.event === "draw:stroke") {
        const canvas = window.drawCanvas;
        if (canvas) {
          const ctx = canvas.getContext("2d");
          window.replayStroke(ctx, msg.payload);
        }
      }
    };

    window.socketHeartbeat = setInterval(() => {
      window.ws.send(
        JSON.stringify({
          topic: "phoenix",
          event: "heartbeat",
          payload: {},
          ref: String(window.socketRef++),
        }),
      );
    }, 30000);

    window.sendStroke = function (stroke) {
      window.ws.send(
        JSON.stringify({
          topic: "draw:lobby",
          event: "draw:stroke",
          payload: stroke,
          ref: String(window.socketRef++),
        }),
      );
    };

    window.replayStroke = function (ctx, stroke) {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.beginPath();
      const [start, ...rest] = stroke.points;
      ctx.moveTo(start.x, start.y);
      for (const point of rest) {
        ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
    };
  }

  if (window.drawCanvas) {
    window.drawCanvas.remove();
    window.drawCanvas = null;
    clearInterval(window.socketHeartbeat);
    window.ws.close();
    return false;
  } else {
    const canvas = document.createElement("canvas");
    canvas.id = "draw-canvas";
    canvas.style.position = "fixed";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.zIndex = "100000";
    canvas.style.pointerEvents = "auto";
    canvas.style.cursor = "crosshair";
    canvas.style.boxShadow = "inset green 0px 0px 0px 3px";
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    document.body.appendChild(canvas);
    window.drawCanvas = canvas;

    const ctx = canvas.getContext("2d");
    ctx.strokeStyle = "red";
    ctx.lineWidth = 3;

    let drawing = false;
    let currentStroke = null;

    canvas.addEventListener("mousedown", (e) => {
      drawing = true;
      ctx.beginPath();
      ctx.moveTo(e.clientX, e.clientY);
      currentStroke = {
        color: ctx.strokeStyle,
        width: ctx.lineWidth,
        points: [{ x: e.clientX, y: e.clientY }],
      };
    });

    canvas.addEventListener("mousemove", (e) => {
      if (!drawing) return;
      currentStroke.points.push({ x: e.clientX, y: e.clientY });
      ctx.lineTo(e.clientX, e.clientY);
      ctx.stroke();
    });

    canvas.addEventListener("mouseup", () => {
      drawing = false;
      if (currentStroke) {
        window.sendStroke(currentStroke);
        currentStroke = null;
      }
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        canvas.remove();
        if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ type: "deactivateIcon" });
        }
        clearInterval(window.socketHeartbeat);
        window.ws.close();
        window.drawCanvas = null;
      }
    });

    return true;
  }
}
