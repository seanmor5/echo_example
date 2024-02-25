// If you want to use Phoenix channels, run `mix help phx.gen.channel`
// to get started and then uncomment the line below.
// import "./user_socket.js"

// You can include dependencies in two ways.
//
// The simplest option is to put them in assets/vendor and
// import them using relative paths:
//
//     import "../vendor/some-package.js"
//
// Alternatively, you can `npm install some-package --prefix assets` and import
// them using a path starting with the package name:
//
//     import "some-package"
//

// Include phoenix_html to handle method=PUT/DELETE in forms and buttons.
import "phoenix_html"
// Establish Phoenix Socket and LiveView configuration.
import {Socket} from "phoenix"
import {LiveSocket} from "phoenix_live_view"
import topbar from "../vendor/topbar"
import {Encoder, Decoder} from "@msgpack/msgpack";

const encoder = new Encoder({ ignoreUndefined: true });
const decoder = new Decoder();

// Recording Controls
const SAMPLING_RATE = 16_000;

// Conversational channel supporting 2-way conversations.
const Conversation = {
  socket: null,
  microphoneContext: null,
  speakerContext: null,
  source: null,
  audioQueue: [],
  isPlaying: false,
  isConversing: false,
  token: null,

  mounted() {
    var hook = this;
    let csrfToken = document.querySelector("meta[name='csrf-token']").getAttribute("content");

    // REPLACE WITH YOUR SERVER
    this.socket = new WebSocket("ws://localhost:4001/conversation/websocket");
    this.socket.binaryType = "arraybuffer";

    this.el.addEventListener("click", () => {
      hook.pushEvent("toggle_conversation");

      if (!this.isConversing) {
        const message = { type: "open", prompt: "You are a dental office assistant on the phone helping a user book an appointment." };
        this.socket.send(encoder.encode(message), { type: "application/octet-stream" });
        this.initAudio();
      } else {
        const message = { type: "close" };
        this.socket.send(encoder.encode(message), { type: "application/octet-stream" });
        this.stopAudio();
      }

    });
  },

  stopAudio() {
    if (this.source) {
      this.source.onended = null;
      this.source.stop();
      this.source = null;
    }

    this.microphoneContext.suspend();
    this.microphoneContext = null;
    this.speakerContext.suspend();
    this.speakerContext = null;
    this.audioQueue = [];
    this.isPlaying = false;
  },

  initAudio() {
    const audioOptions = {
      sampleRate: SAMPLING_RATE,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    };

    this.microphoneContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: SAMPLING_RATE
    });

    this.speakerContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 44_100
    });

    // Playback
    this.socket.onmessage = (event) => {
      const arrayBuffer = event.data;
      const packed = new Uint8Array(arrayBuffer);
      const decoded = decoder.decode(packed);
      const { type } = decoded;

      switch (type) {
        case "audio":
          const data = decoded.audio;
          const buffer = data.slice(0, data.length).buffer;

          const token = new TextDecoder("ascii").decode(data.slice(0, 8));
          const audio = new Int16Array(buffer, 8);

          this.enqueueAudioData({ token, audio });
          break;

        case "token":
          this.token = decoded.token;
          break;

        case "interrupt":
          this.token = decoded.token;
          // Suspend playback
          if (this.speakerContext.state === 'running') {
            this.speakerContext.suspend().then(() => {
              if (this.source) {
                this.source.onended = null;
                this.source.stop();
                this.source = null;
              }
              this.isPlaying = false;
              this.audioQueue = [];
            });
          }
          break;

        default:
          return;
      }
    };

    // Recording
    navigator.mediaDevices.getUserMedia({ audio: audioOptions }).then((stream) => {
      const source = this.microphoneContext.createMediaStreamSource(stream);
      this.processor = this.microphoneContext.createScriptProcessor(2048, 1, 1);

      this.processor.onaudioprocess = (e) => {
        const pcmFloat32Data = this.convertEndianness32(
          e.inputBuffer.getChannelData(0),
          this.getEndianness(),
          this.el.dataset.endianness
        );

        const message = { type: "audio", audio: pcmFloat32Data };

        this.socket.send(encoder.encode(message), { type: "application/octet-stream" });
      };

      source.connect(this.processor);
      this.processor.connect(this.microphoneContext.destination);
    });
  },

  enqueueAudioData(data) {
    this.audioQueue.push(data);

    if (!this.isPlaying) {
      this.playFromQueue();
    }
  },

  playFromQueue() {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      const message = { type: "state", state: "waiting" };
      this.socket.send(encoder.encode(message), { type: "application/octet-stream" });
      return;
    }

    let audioData;
    while (this.audioQueue.length > 0) {
      const { token, audio } = this.audioQueue.shift();

      if (token === this.token) {
        audioData = audio;
        break;
      }
    }

    if (this.speakerContext.state === 'suspended') {
      this.speakerContext.resume().then(() => {
        console.log('Audio playback resumed');
      });
    }

    this.isPlaying = true;

    if (audioData) {
      const float32Data = new Float32Array(audioData.length);

      for (let i = 0; i < audioData.length; i++) {
        float32Data[i] = audioData[i] / 0x8000;
      }

      const audioBuffer = this.speakerContext.createBuffer(1, float32Data.length, 44100);
      audioBuffer.getChannelData(0).set(float32Data);

      this.source = this.speakerContext.createBufferSource();
      this.source.buffer = audioBuffer;
      this.source.connect(this.speakerContext.destination);
      this.source.onended = () => this.playFromQueue();
      this.source.start();
    }
  },

  convertEndianness32(buffer, from, to) {
    if (from === to) {
      return buffer;
    }

    // If the endianness differs, we swap bytes accordingly
    for (let i = 0; i < buffer.byteLength / 4; i++) {
      const b1 = buffer[i];
      const b2 = buffer[i + 1];
      const b3 = buffer[i + 2];
      const b4 = buffer[i + 3];
      buffer[i] = b4;
      buffer[i + 1] = b3;
      buffer[i + 2] = b2;
      buffer[i + 3] = b1;
    }

    return buffer;
  },

  getEndianness() {
    const buffer = new ArrayBuffer(2);
    const int16Array = new Uint16Array(buffer);
    const int8Array = new Uint8Array(buffer);

    int16Array[0] = 1;

    if (int8Array[0] === 1) {
      return "little";
    } else {
      return "big";
    }
  },
};

const hooks = { Conversation };

let csrfToken = document.querySelector("meta[name='csrf-token']").getAttribute("content")
let liveSocket = new LiveSocket("/live", Socket, {params: {_csrf_token: csrfToken}, hooks: hooks});

// Show progress bar on live navigation and form submits
topbar.config({barColors: {0: "#29d"}, shadowColor: "rgba(0, 0, 0, .3)"})
window.addEventListener("phx:page-loading-start", _info => topbar.show(300))
window.addEventListener("phx:page-loading-stop", _info => topbar.hide())

// connect if there are any LiveViews on the page
liveSocket.connect()

// expose liveSocket on window for web console debug logs and latency simulation:
// >> liveSocket.enableDebug()
// >> liveSocket.enableLatencySim(1000)  // enabled for duration of browser session
// >> liveSocket.disableLatencySim()
window.liveSocket = liveSocket