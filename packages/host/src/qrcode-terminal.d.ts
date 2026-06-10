// qrcode-terminal ships no types; minimal declaration for the surface we use.
declare module "qrcode-terminal" {
  interface QrCodeTerminal {
    generate(text: string, options?: { small?: boolean }, callback?: (qrcode: string) => void): void;
    setErrorLevel(level: "L" | "M" | "Q" | "H"): void;
  }
  const qrcode: QrCodeTerminal;
  export default qrcode;
}
