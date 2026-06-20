// Cloudflare Workers bundle these binary imports: .wasm becomes a compiled
// WebAssembly.Module, and .ttf (declared as a Data rule in wrangler.toml)
// becomes an ArrayBuffer.
declare module '*.wasm' {
  const wasmModule: WebAssembly.Module;
  export default wasmModule;
}
declare module '*.ttf' {
  const data: ArrayBuffer;
  export default data;
}
