export function resolveBase(apiBaseUrl: string, baseUrl: string): Promise<unknown>;
export function fetchBaseList(apiBaseUrl: string): Promise<unknown>;
export function fetchBaseSchema(
  apiBaseUrl: string,
  params: {
    baseToken: string;
    tableId?: string;
  }
): Promise<unknown>;
export function fetchBaseRecords(
  apiBaseUrl: string,
  params: {
    baseToken: string;
    tableId: string;
    viewId?: string;
  }
): Promise<unknown>;
