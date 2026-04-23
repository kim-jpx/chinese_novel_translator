declare module "opencc-js" {
  export type OpenCCLocale = "cn" | "tw" | "twp" | "hk" | "jp" | "t";

  export interface ConverterOptions {
    from?: OpenCCLocale;
    to?: OpenCCLocale;
  }

  export type ConvertText = (text: string) => string;

  export function Converter(options: ConverterOptions): ConvertText;
}
