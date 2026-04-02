import { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { basicSetup } from '@codemirror/basic-setup';
import { StreamLanguage, syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';

// KimchiLang Runtime — imported by all transpiled modules
// This file is emitted once and shared, instead of inlined in every output file.

// Stdlib prototype extensions
if (!Array.prototype._kmExtended) {
  Array.prototype._kmExtended = true;
  Array.prototype.first = function() { return this[0]; };
  Array.prototype.last = function() { return this[this.length - 1]; };
  Array.prototype.isEmpty = function() { return this.length === 0; };
  Array.prototype.sum = function() { return this.reduce((a, b) => a + b, 0); };
  Array.prototype.product = function() { return this.reduce((a, b) => a * b, 1); };
  Array.prototype.average = function() { return this.reduce((a, b) => a + b, 0) / this.length; };
  Array.prototype.max = function() { return Math.max(...this); };
  Array.prototype.min = function() { return Math.min(...this); };
  Array.prototype.take = function(n) { return this.slice(0, n); };
  Array.prototype.drop = function(n) { return this.slice(n); };
  Array.prototype.flatten = function() { return this.flat(Infinity); };
  Array.prototype.unique = function() { return [...new Set(this)]; };
}

if (!String.prototype._kmExtended) {
  String.prototype._kmExtended = true;
  String.prototype.isEmpty = function() { return this.length === 0; };
  String.prototype.isBlank = function() { return this.trim().length === 0; };
  String.prototype.toChars = function() { return this.split(""); };
  String.prototype.toLines = function() { return this.split("\n"); };
  String.prototype.capitalize = function() { return this.length === 0 ? this : this[0].toUpperCase() + this.slice(1); };
}

// Object utilities
const _obj = {
  keys: (o) => Object.keys(o),
  values: (o) => Object.values(o),
  entries: (o) => Object.entries(o),
  fromEntries: (arr) => Object.fromEntries(arr),
  has: (o, k) => Object.hasOwn(o, k),
  freeze: (o) => Object.freeze(o),
  isEmpty: (o) => Object.keys(o).length === 0,
  size: (o) => Object.keys(o).length,
};

// Typed error helper
function error(message, _id = "Error") {
  const e = new Error(message);
  e._id = _id;
  return e;
}
error.create = (_id) => {
  const fn = (message) => error(message, _id);
  fn._id = _id;
  return fn;
};


const _mod_snippets = (() => {
const taglines = ["Kimchi probiotics bind 87% of pollutants — we bind 100% of bugs", "Kimchi bacteria survive intestinal conditions — our code survives production", "Kimchi increases excretion of nanoplastics — we flush out technical debt", "Kimchi's Leuconostoc mesenteroides stays stable under stress — so does this compiler", "Kimchi fermentation produces resilient microorganisms — we produce resilient programs", "Kimchi probiotics adsorb contaminants on contact — our linter catches issues on save", "Kimchi reduces accumulation in the GI tract — we reduce accumulation in your codebase", "Kimchi's probiotic efficiency holds at 57% in the gut — our runtime holds at 100%"];

  return { taglines };
})();



var data = _mod_snippets;

const kwPattern = /^(fn|dec|mut|return|if|else|match|guard|when|print|expose|enum|type|memo|and|or|not|true|false|null|collect|hoard|race|sleep|spawn|worker|extern|module|arg|as|dep|test|describe|expect|assert|throw|try|catch|is)\b/;
function tokenizeKimchi(stream) {
  if (stream?.match(/^\/\/.*/)) {
    return "comment";
  }
  if (stream?.match(/^"[^"]*"/)) {
    return "string";
  }
  if (stream?.match(/^-?\d+(\.\d+)?/)) {
    return "number";
  }
  if (stream?.match(kwPattern)) {
    return "keyword";
  }
  if (stream?.match(/^(~>|>>|=>|\.\.\.)/)) {
    return "operator";
  }
  if (stream?.match(/^[a-zA-Z_]\w*/)) {
    return "variableName";
  }
  if (stream?.eatSpace()) {
    return null;
  }
  stream?.next();
  return null;
}

const kimchiMode = StreamLanguage.define({ token: tokenizeKimchi });
const kimchiTheme = EditorView.theme({ "&": { backgroundColor: "#fff" }, ".cm-content": { caretColor: "#e84c3d" }, ".cm-cursor": { borderLeftColor: "#e84c3d" }, "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": { background: "#fde8e5" }, ".cm-activeLine": { background: "#faf8f5" }, ".cm-gutters": { background: "#fafafa", borderRight: "1px solid #eee", color: "#ccc" }, ".cm-activeLineGutter": { background: "#f0f0f0" } });
const kimchiHighlight = syntaxHighlighting(HighlightStyle.define([{ tag: tags.keyword, color: "#e84c3d", fontWeight: "600" }, { tag: tags.comment, color: "#bbb", fontStyle: "italic" }, { tag: tags.string, color: "#2a8c6a" }, { tag: tags.number, color: "#3a7ab5" }, { tag: tags.variableName, color: "#2a2a2a" }, { tag: tags.operator, color: "#7c5cbf" }]));
function Editor(props) {
  let editorRef = useRef(null);
  let viewRef = useRef(null);
  useEffect(() => {
    if ((editorRef.current != null)) {
      const state = EditorState.create({ doc: props?.code, extensions: [basicSetup, kimchiMode, kimchiTheme, kimchiHighlight, EditorView.lineWrapping, keymap.of([{ key: "Mod-Enter", run: () => {
        props?.onRun();
        return true;
      } }])] });
      const view = new EditorView({ state, parent: editorRef.current });
      viewRef.current = view;
      return () => {
        view.destroy();
      };
      return;
    }
  }, [props?.code]);
  useEffect(() => {
    props?.onViewReady(viewRef);
  }, []);
  return jsx("div", { className: "editor-wrap", ref: editorRef });
}

function Sidebar(props) {
  return jsxs("aside", { className: "sidebar", children: [jsx("div", { className: "sidebar-title", children: "Try it out" }), props?.examples?.map((ex, i) => {
    const cls = ("sidebar-item" + ((i === props?.active) ? " active" : ""));
    return jsxs("div", { className: cls, onClick: () => props.onSelect(i), children: [jsx("div", { className: "sidebar-item-name", children: ex.name }), jsx("div", { className: "sidebar-item-desc", children: ex.desc })] }, i);
  })] });
}

function Output(props) {
  return jsxs("section", { className: "output-pane", children: [jsxs("div", { className: "pane-header", children: [jsx("span", { className: "pane-label", children: "Output" }), jsx("span", { className: "pane-meta pane-timing", children: props.timing })] }), jsx("pre", { className: "output", children: (props?.error ? jsx("span", { className: "error", children: props.error }) : props?.lines?.map((line, i) => jsx("div", { children: line }, i))) })] });
}

function Tagline() {
  const [index, setIndex] = useState(Math.floor((Math.random() * data?.taglines?.length)));
  const [opacity, setOpacity] = useState(1);
  useEffect(() => {
    const interval = setInterval(() => {
      setOpacity(0);
      setTimeout(() => {
        setIndex(i => ((i + 1) % data?.taglines?.length));
        setOpacity(1);
      }, 500);
    }, 5000);
    return () => clearInterval(interval);
  }, []);
  return jsx("span", { className: "tagline", style: {opacity: opacity, transition: "opacity 0.5s"}, children: data.taglines[index] });
}

function App() {
  const [examples, setExamples] = useState([]);
  const [activeExample, setActiveExample] = useState(0);
  const [outputLines, setOutputLines] = useState([]);
  const [error, setError] = useState(null);
  const [timing, setTiming] = useState("");
  let viewRef = useRef(null);
  useEffect(() => {
    fetch("/examples.json")?.then(res => res?.json())?.then(data => setExamples(data));
  }, []);
  function getCode() {
    if (((viewRef.current != null) && (viewRef.current?.current != null))) {
      return viewRef.current?.current?.state?.doc?.toString();
      return;
    } else if ((examples?.length > 0)) {
      return examples?.[activeExample]?.code;
      return;
    }
    return "";
  }
  
  function handleCompile() {
    const source = getCode();
    setOutputLines([]);
    setError(null);
    setTiming("");
    const start = performance?.now();
    fetch("/compile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source }) })?.then(res => res?.json())?.then(result => {
      const elapsed = Math.round((performance?.now() - start));
      if (result?.error) {
        setError(result?.error);
        return null;
        return;
      }
      setTiming(`compiled in ${elapsed}ms`);
      setOutputLines(result?.js?.split("\n"));
    })?.catch(err => {
      setError(`Network error: ${err?.message}`);
    });
  }
  
  function handleRun() {
    const source = getCode();
    setOutputLines([]);
    setError(null);
    setTiming("");
    const start = performance?.now();
    fetch("/compile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source }) })?.then(res => res?.json())?.then(result => {
      if (result?.error) {
        setError(result?.error);
        return null;
        return;
      }
      let iframe = document.createElement("iframe");
      iframe.sandbox = "allow-scripts allow-same-origin";
      iframe.style.display = "none";
      document.body?.appendChild(iframe);
      let collected = [];
      function handler(event) {
        if ((event?.source !== iframe.contentWindow)) {
          return null;
          return;
        }
        const msg = event?.data;
        if ((msg.type === "print")) {
          collected.push(msg.text);
          setOutputLines([...collected]);
          return;
        } else if ((msg.type === "done")) {
          const elapsed = Math.round((performance?.now() - start));
          setTiming(`ran in ${elapsed}ms`);
          if ((collected.length === 0)) {
            setOutputLines(["(no output)"]);
            return;
          }
          window.removeEventListener("message", handler);
          iframe.remove();
          return;
        } else if ((msg.type === "error")) {
          const elapsed = Math.round((performance?.now() - start));
          setTiming(`error in ${elapsed}ms`);
          setError(msg.message);
          window.removeEventListener("message", handler);
          iframe.remove();
          return;
        }
      }
      
      window.addEventListener("message", handler);
      const sandboxCode = ((((((((((((((result?.runtime + "\n") + "const _output = [];\n") + "console.log = (...args) => {\n") + "  const text = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');\n") + "  _output.push(text);\n") + "  parent.postMessage({ type: 'print', text: text }, '*');\n") + "};\n") + "try {\n") + result?.js) + "\n") + "  parent.postMessage({ type: 'done', output: _output }, '*');\n") + "} catch (e) {\n") + "  parent.postMessage({ type: 'error', message: e.message || String(e) }, '*');\n") + "}");
      const htmlDoc = (((("<!DOCTYPE html><html><body><scr" + "ipt>") + sandboxCode) + "</scr") + "ipt></body></html>");
      iframe.srcdoc = htmlDoc;
    })?.catch(err => {
      setError(`Network error: ${err?.message}`);
    });
  }
  
  function handleSelect(index) {
    setActiveExample(index);
    setOutputLines([]);
    setError(null);
    setTiming("");
  }
  
  function handleViewReady(ref) {
    viewRef.current = ref;
  }
  
  if ((examples?.length === 0)) {
    return jsx("div", { className: "playground", children: jsx("div", { style: {padding: "40px", textAlign: "center", fontFamily: "DM Sans, sans-serif"}, children: "Loading..." }) });
    return;
  }
  return jsxs("div", { className: "playground", children: [jsxs("header", { className: "topbar", children: [jsxs("div", { className: "topbar-left", children: [jsx("img", { src: "logo.png", alt: "KimchiLang", className: "logo" }), jsxs("div", { className: "brand", children: [jsx("span", { className: "brand-name", children: "KimchiLang" }), jsx("span", { className: "brand-label", children: "playground" })] })] }), jsxs("div", { className: "topbar-right", children: [jsx("span", { className: "btn-compile", onClick: handleCompile, children: "Compile" }), jsx("span", { className: "btn-run", onClick: handleRun, children: "Run" })] })] }), jsxs("div", { className: "panes", children: [jsx(Sidebar, { examples: examples, active: activeExample, onSelect: handleSelect }), jsxs("section", { className: "editor-pane", children: [jsxs("div", { className: "pane-header", children: [jsx("span", { className: "pane-label", children: "Editor" }), jsx("span", { className: "pane-meta", children: ".km" })] }), jsx(Editor, { code: examples[activeExample].code, onRun: handleRun, onViewReady: handleViewReady })] }), jsx(Output, { lines: outputLines, error: error, timing: timing })] }), jsxs("footer", { className: "statusbar", children: [jsx(Tagline, {}), jsx("span", { className: "site-url", children: "kimchilang.org" })] })] });
}

const root = createRoot(document.getElementById("root"));
root.render(jsx(App, {}));

