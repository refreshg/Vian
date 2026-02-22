export interface BitrixDeal {
  ID: string;
  TITLE: string;
  OPPORTUNITY: string;
  STAGE_ID: string;
  DATE_CREATE: string;
  /** Custom field: department (mock if not present) */
  UF_CRM_DEPARTMENT?: string;
  /** Custom field: rejection reason for lost deals (mock if not present) */
  UF_CRM_REJECTION_REASON?: string;
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
