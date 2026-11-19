// Vite asset imports (the Kokoro worker's wasm and dictionary).
declare module '*?url' {
  const url: string;
  export default url;
}
