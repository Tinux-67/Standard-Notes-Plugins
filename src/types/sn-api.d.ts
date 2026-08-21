/**
 * Type definitions for the Standard Notes Extension API.
 * These types are based on the expected structure of the API as used in plugins.
 */

export interface SNNote {
  uuid: string;
  content_type: string;
  content: {
    title?: string;
    tags?: string[];
    [key: string]: any;
  };
  [key: string]: any;
}

export interface SNExtensionApi {
  /**
   * Retrieves a list of items (notes, etc.) from the user's account.
   * @returns A promise that resolves to an array of SNNote items.
   */
  getItems: () => Promise<SNNote[] | null>;
  
  // Add other API methods here as they are discovered/needed
}

declare module "sn-extension-api" {
  import { SNExtensionApi } from "./sn-api";
  const snApi: SNExtensionApi;
  export default snApi;
}
