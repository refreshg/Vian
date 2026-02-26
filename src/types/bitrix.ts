export interface BitrixDeal {
  ID: string;
  TITLE: string;
  OPPORTUNITY: string;
  STAGE_ID: string;
  DATE_CREATE: string;
  /** Standard Bitrix24 deal source (use crm.status.list ENTITY_ID=SOURCE for names) */
  SOURCE_ID?: string;
  /** Custom dropdown: department (ID UF_CRM_1758023694929) */
  UF_CRM_1758023694929?: string | number;
  /** Rejection Reasons dropdown – UF_CRM_1753862633986 */
  UF_CRM_1753862633986?: string | number;
  /** Comment (list) dropdown – UF_CRM_1768995573895 */
  UF_CRM_1768995573895?: string | number;
  /** Country dropdown – UF_CRM_1769688668259 */
  UF_CRM_1769688668259?: string | number;
}

export interface BitrixDealListResponse {
  result: BitrixDeal[];
  total?: number;
  next?: number;
  error?: string;
  error_description?: string;
}

export interface DealListParams {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}
