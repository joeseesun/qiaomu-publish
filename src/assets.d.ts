declare module "*.woff2" {
  /** Base64 of the file, produced by the esbuild `base64` loader. */
  const base64: string;
  export default base64;
}
