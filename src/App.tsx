import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { BlockitClient, type DocumentRef } from '@lark-opdev/block-docs-addon-api';
import * as baseApi from './baseApi.js';
import './index.css';

declare const __TIMELINE_API_BASE_URL__: string | undefined;

const DocMiniApp = new BlockitClient().initAPI();

type DataSourceMode = 'backend' | 'json';
type UILanguage = 'system' | 'zh-CN' | 'en-US' | 'ja-JP';

type BaseRecord = {
  record_id?: string;
  fields: Record<string, unknown>;
};

type BaseRecordsResponse = {
  records: BaseRecord[];
};

type BaseTable = {
  id: string;
  name: string;
};

type BaseField = {
  id: string;
  name: string;
  type: string;
};

type BaseSchemaResponse = {
  baseToken?: string;
  tableId?: string;
  viewId?: string;
  tables: BaseTable[];
  fields: BaseField[];
};

type RuntimeContext = {
  docRef: DocumentRef | null;
  storageKey: string;
};

type RecentBaseOption = {
  id: string;
  name: string;
  url: string;
  baseToken: string;
  tableId?: string;
  viewId?: string;
  ownerId?: string;
};

type BaseListResponse = {
  items: RecentBaseOption[];
};

type AuthStartResponse = {
  state: string;
  authorizeUrl: string;
};

type AuthSessionResponse = {
  status: 'missing' | 'pending' | 'authorized' | 'failed';
  state: string;
  error?: string;
  scope?: string;
  expiresAt?: number;
};

type DetailState = {
  item: TimelineItem;
  rangeText: string;
} | null;

type TimelineEntry = {
  recordId?: string;
  title: string;
  description: string;
  startAt?: Date;
  endAt?: Date;
};

type TranslationCopy = {
  timeline: string;
  fullscreen: string;
  exitFullscreen: string;
  settings: string;
  openSettings: string;
  close: string;
  empty: string;
  system: string;
  chinese: string;
  english: string;
  japanese: string;
  language: string;
  currentDoc: string;
  chooseBase: string;
  changeBase: string;
  selectedBase: string;
  noBaseSelected: string;
  recentBases: string;
  noRecentBases: string;
  useThisBase: string;
  searchBase: string;
  searchBasePlaceholder: string;
  currentBase: string;
  recentlyUsed: string;
  allBases: string;
  noSearchResults: string;
  authorizeBaseAccess: string;
  authorizingBaseAccess: string;
  baseAccessHint: string;
  baseAccessPending: string;
  loadSchema: string;
  loadingSchema: string;
  loadingBases: string;
  loadData: string;
  loadingData: string;
  dataSource: string;
  advancedSettings: string;
  showAdvanced: string;
  hideAdvanced: string;
  backend: string;
  json: string;
  backendUrl: string;
  backendTip: string;
  backendUrlRequired: string;
  baseTokenRequired: string;
  invalidBasePageUrl: string;
  invalidSchemaEndpoint: string;
  schemaLoadFailed: string;
  loadFailed: string;
  requestFailed: string;
  dataServiceUnavailable: string;
  authorizationRequired: string;
  permissionDenied: string;
  baseNotFound: string;
  noTablesFound: string;
  invalidSelection: string;
  responseInvalid: string;
  jsonInvalid: string;
  fullscreenToggleFailed: string;
  jsonLabel: string;
  baseToken: string;
  tableId: string;
  selectTable: string;
  viewId: string;
  optional: string;
  groupField: string;
  startDateField: string;
  endDateField: string;
  titleField: string;
  descriptionField: string;
  statsRule: string;
  statsRuleValue: string;
  groupFieldPlaceholder: string;
  startDatePlaceholder: string;
  endDatePlaceholder: string;
  fieldOptionalPlaceholder: string;
  detailTitle: string;
  detailRange: string;
  detailCount: string;
  detailDescription: string;
  detailRecords: string;
  expandRecords: string;
  collapseRecords: string;
  detailEmpty: string;
  unrecognized: string;
  unknownRange: string;
  unknownGroup: string;
  recordsUnit: string;
  itemsSuffix: string;
  dateSeparator: string;
  closeDetail: string;
};

type TimelineItem = {
  key: string;
  title: string;
  description?: string;
  startAt?: Date;
  endAt?: Date;
  count: number;
  entries: TimelineEntry[];
};

type TimelineConfig = {
  mode: DataSourceMode;
  uiLanguage: UILanguage;
  baseLink: string;
  backendUrl: string;
  baseToken: string;
  tableId: string;
  viewId: string;
  groupField: string;
  startDateField: string;
  endDateField: string;
  titleField: string;
  descriptionField: string;
  pastedJson: string;
};

const api = baseApi as {
  startLarkAuth: (apiBaseUrl: string) => Promise<unknown>;
  fetchLarkAuthSession: (apiBaseUrl: string, state: string) => Promise<unknown>;
  fetchBaseList: (apiBaseUrl: string, authState?: string) => Promise<unknown>;
  fetchBaseSchema: (apiBaseUrl: string, params: { baseToken: string; tableId?: string }) => Promise<unknown>;
  resolveBase: (apiBaseUrl: string, baseUrl: string) => Promise<unknown>;
  fetchBaseRecords: (
    apiBaseUrl: string,
    params: { baseToken: string; tableId: string; viewId?: string }
  ) => Promise<unknown>;
};

const STORAGE_KEY_PREFIX = 'timeline.config.v1';
const DEFAULT_STORAGE_KEY = `${STORAGE_KEY_PREFIX}:default`;
const RECENT_BASES_STORAGE_KEY = 'timeline.recent-bases.v1';

const getDefaultBackendUrl = () => {
  if (typeof __TIMELINE_API_BASE_URL__ === 'string' && __TIMELINE_API_BASE_URL__.trim()) {
    return __TIMELINE_API_BASE_URL__.trim();
  }
  return 'http://localhost:8787';
};

const createDefaultConfig = (): TimelineConfig => ({
  mode: 'backend',
  uiLanguage: 'system',
  baseLink: '',
  backendUrl: getDefaultBackendUrl(),
  baseToken: 'ZWFvb2JuIawDbYsLHtSjQP4spZg',
  tableId: 'tblH0MytgDjxieFS',
  viewId: 'vewxycGIAm',
  groupField: 'データ指標',
  startDateField: '開始時間',
  endDateField: '終了時間',
  titleField: 'OKR 項目',
  descriptionField: '12月7日週次報告',
  pastedJson: JSON.stringify(
    {
      records: [
        {
          record_id: 'recBXnsyIl',
          fields: {
            'OKR 項目': 'KR 1.1 フィードバックの収集および整理',
            '開始時間': '2021-05-01 01:00:00',
            '終了時間': '2021-05-15 01:00:00',
            'データ指標': ['満足度 10% アップ'],
            '12月7日週次報告': '週次報告の説明...',
          },
        },
        {
          record_id: 'recMvRh5kZ',
          fields: {
            'OKR 項目': 'KR 1.2 フィードバックをもとに機能を更新',
            '開始時間': '2021-05-01 01:00:00',
            '終了時間': '2021-05-30 01:00:00',
            'データ指標': ['満足度 10% アップ'],
            '12月7日週次報告': '週次報告の説明...',
          },
        },
        {
          record_id: 'recc9Y8R4E',
          fields: {
            'OKR 項目': 'KR 2.1 要求の査定およびタスクの分解',
            '開始時間': '2021-05-15 01:00:00',
            '終了時間': '2021-05-30 01:00:00',
            'データ指標': ['延期率 5% にダウン'],
            '12月7日週次報告': '週次報告の説明...',
          },
        },
        {
          record_id: 'recMpasMcu',
          fields: {
            'OKR 項目': 'KR 3.1 複数のプラットフォームにて新規ユーザー向けのイベントの開催',
            '開始時間': '2021-06-01 01:00:00',
            '終了時間': '2021-06-30 01:00:00',
            'データ指標': ['業務増加率 5%', '満足度 10% アップ'],
            '12月7日週次報告': '週次報告の説明...',
          },
        },
        {
          record_id: 'recbKPnzki',
          fields: {
            'OKR 項目': 'KR 3.3 コミュニティへのユーザー勧誘',
            '開始時間': '2021-06-01 01:00:00',
            '終了時間': '2021-06-30 01:00:00',
            'データ指標': ['業務増加率 5%', '使用率 4% アップ'],
            '12月7日週次報告': '週次報告の説明...',
          },
        },
      ],
    },
    null,
    2
  ),
});

const translations: Record<Exclude<UILanguage, 'system'>, TranslationCopy> = {
  'zh-CN': {
    timeline: '时间线',
    fullscreen: '全屏',
    exitFullscreen: '退出全屏',
    settings: '设置',
    openSettings: '打开设置',
    close: '关闭',
    empty: '暂无数据',
    system: '跟随系统',
    chinese: '中文',
    english: 'English',
    japanese: '日本語',
    language: '界面语言',
    currentDoc: '当前文档',
    chooseBase: '选择 Base',
    changeBase: '更换 Base',
    selectedBase: '已选 Base',
    noBaseSelected: '尚未选择 Base',
    recentBases: '可选 Base',
    noRecentBases: '暂无可访问的 Base',
    useThisBase: '使用这个 Base',
    searchBase: '搜索 Base',
    searchBasePlaceholder: '按名称或 Token 搜索',
    currentBase: '当前已选',
    recentlyUsed: '最近使用',
    allBases: '全部 Base',
    noSearchResults: '没有匹配的 Base',
    authorizeBaseAccess: '授权读取 Base',
    authorizingBaseAccess: '授权中…',
    baseAccessHint: '请先完成当前账号的数据授权，授权后才能列出你可访问的 Base。',
    baseAccessPending: '授权页面已打开，完成授权后这里会自动刷新。',
    loadSchema: '读取表结构',
    loadingSchema: '读取中…',
    loadingBases: '加载 Base 中…',
    loadData: '加载数据',
    loadingData: '加载中…',
    dataSource: '数据源',
    advancedSettings: '高级设置',
    showAdvanced: '展开高级设置',
    hideAdvanced: '收起高级设置',
    backend: '后端接口',
    json: '粘贴 JSON',
    backendUrl: '接口地址',
    backendTip: '当前 Base 暂时无法读取。请重新选择 Base，或稍后重试。',
    backendUrlRequired: '请填写后端接口地址',
    baseTokenRequired: '请先填写 Base Token',
    invalidBasePageUrl: '当前填写的是 Base 页面链接，不是后端 API 地址。请填写可返回 records 的接口地址。',
    invalidSchemaEndpoint: '无法从当前接口地址推导表结构接口，请使用以 /records 结尾的 API 地址。',
    schemaLoadFailed: '读取表结构失败',
    loadFailed: '加载失败',
    requestFailed: '请求失败',
    dataServiceUnavailable: '当前数据服务暂时不可用，请稍后重试。',
    authorizationRequired: '当前账号还没有完成数据授权，请重新授权后再试。',
    permissionDenied: '当前账号没有访问这个 Base 的权限，请更换 Base 或检查权限。',
    baseNotFound: '没有找到这个 Base，请确认所选 Base 仍然可用。',
    noTablesFound: '这个 Base 中没有可用的数据表，请更换其他 Base。',
    invalidSelection: '当前选择无效，请重新选择 Base。',
    responseInvalid: '接口返回格式不正确：缺少 records 数组',
    jsonInvalid: 'JSON 格式不正确：缺少 records 数组',
    fullscreenToggleFailed: '全屏切换失败',
    jsonLabel: 'JSON',
    baseToken: 'Base Token',
    tableId: 'Table ID',
    selectTable: '请选择数据表',
    viewId: 'View ID',
    optional: '可选',
    groupField: '参考字段',
    startDateField: '开始日字段',
    endDateField: '结束日字段',
    titleField: '标题字段',
    descriptionField: '说明字段',
    statsRule: '统计规则',
    statsRuleValue: '同一参考值：最早开始日 + 最晚结束日',
    groupFieldPlaceholder: '用于分组（支持多值）',
    startDatePlaceholder: '请选择开始日字段',
    endDatePlaceholder: '请选择结束日字段',
    fieldOptionalPlaceholder: '可选',
    detailTitle: '详情',
    detailRange: '时间范围',
    detailCount: '记录数',
    detailDescription: '详细内容',
    detailRecords: '记录明细',
    expandRecords: '展开明细',
    collapseRecords: '收起明细',
    detailEmpty: '暂无详细内容',
    unrecognized: '未识别',
    unknownRange: '—',
    unknownGroup: '未分组',
    recordsUnit: '条记录',
    itemsSuffix: '条',
    dateSeparator: ' ~ ',
    closeDetail: '关闭详情',
  },
  'en-US': {
    timeline: 'Timeline',
    fullscreen: 'Fullscreen',
    exitFullscreen: 'Exit Fullscreen',
    settings: 'Settings',
    openSettings: 'Open Settings',
    close: 'Close',
    empty: 'No data',
    system: 'System',
    chinese: '中文',
    english: 'English',
    japanese: '日本語',
    language: 'UI Language',
    currentDoc: 'Current document',
    chooseBase: 'Choose Base',
    changeBase: 'Change Base',
    selectedBase: 'Selected Base',
    noBaseSelected: 'No Base selected',
    recentBases: 'Available Bases',
    noRecentBases: 'No accessible Base available',
    useThisBase: 'Use This Base',
    searchBase: 'Search Base',
    searchBasePlaceholder: 'Search by name or token',
    currentBase: 'Current',
    recentlyUsed: 'Recently Used',
    allBases: 'All Bases',
    noSearchResults: 'No matching Base found',
    authorizeBaseAccess: 'Authorize Base Access',
    authorizingBaseAccess: 'Authorizing…',
    baseAccessHint: 'Please authorize this account first before we can list the Bases you can access.',
    baseAccessPending: 'The authorization page is open. This list will refresh automatically after approval.',
    loadSchema: 'Load Schema',
    loadingSchema: 'Loading…',
    loadingBases: 'Loading Bases…',
    loadData: 'Load Data',
    loadingData: 'Loading…',
    dataSource: 'Data Source',
    advancedSettings: 'Advanced Settings',
    showAdvanced: 'Show Advanced',
    hideAdvanced: 'Hide Advanced',
    backend: 'Backend API',
    json: 'Paste JSON',
    backendUrl: 'API URL',
    backendTip: 'The selected Base cannot be read right now. Please choose the Base again or try later.',
    backendUrlRequired: 'Please enter the backend API URL.',
    baseTokenRequired: 'Please enter Base Token first.',
    invalidBasePageUrl: 'The current URL is a Lark Base page, not a backend API endpoint. Please provide an API that returns records.',
    invalidSchemaEndpoint: 'Cannot derive the schema endpoint from the current API URL. Please use an API URL ending with /records.',
    schemaLoadFailed: 'Load schema failed.',
    loadFailed: 'Load failed.',
    requestFailed: 'Request failed',
    dataServiceUnavailable: 'The data service is temporarily unavailable. Please try again later.',
    authorizationRequired: 'Your account has not completed data authorization. Please authorize again and retry.',
    permissionDenied: 'Your account does not have access to this Base. Please choose another Base or check permissions.',
    baseNotFound: 'This Base could not be found. Please make sure it is still available.',
    noTablesFound: 'This Base does not contain any available tables. Please choose another Base.',
    invalidSelection: 'The current selection is invalid. Please choose the Base again.',
    responseInvalid: 'Response format is invalid: missing records array.',
    jsonInvalid: 'JSON format is invalid: missing records array.',
    fullscreenToggleFailed: 'Failed to toggle fullscreen.',
    jsonLabel: 'JSON',
    baseToken: 'Base Token',
    tableId: 'Table ID',
    selectTable: 'Select a table',
    viewId: 'View ID',
    optional: 'Optional',
    groupField: 'Group Field',
    startDateField: 'Start Date Field',
    endDateField: 'End Date Field',
    titleField: 'Title Field',
    descriptionField: 'Description Field',
    statsRule: 'Aggregation Rule',
    statsRuleValue: 'Same group value: earliest start date + latest end date',
    groupFieldPlaceholder: 'Used for grouping (supports multi-value)',
    startDatePlaceholder: 'Select start date field',
    endDatePlaceholder: 'Select end date field',
    fieldOptionalPlaceholder: 'Optional',
    detailTitle: 'Details',
    detailRange: 'Date Range',
    detailCount: 'Records',
    detailDescription: 'Details',
    detailRecords: 'Records',
    expandRecords: 'Expand',
    collapseRecords: 'Collapse',
    detailEmpty: 'No details',
    unrecognized: 'Unknown',
    unknownRange: '—',
    unknownGroup: 'Ungrouped',
    recordsUnit: 'records',
    itemsSuffix: 'items',
    dateSeparator: ' - ',
    closeDetail: 'Close Details',
  },
  'ja-JP': {
    timeline: 'タイムライン',
    fullscreen: '全画面',
    exitFullscreen: '全画面を終了',
    settings: '設定',
    openSettings: '設定を開く',
    close: '閉じる',
    empty: 'データがありません',
    system: 'システムに従う',
    chinese: '中文',
    english: 'English',
    japanese: '日本語',
    language: '表示言語',
    currentDoc: '現在のドキュメント',
    chooseBase: 'Base を選択',
    changeBase: 'Base を変更',
    selectedBase: '選択中の Base',
    noBaseSelected: 'Base が未選択です',
    recentBases: '選択可能な Base',
    noRecentBases: 'アクセス可能な Base がありません',
    useThisBase: 'この Base を使う',
    searchBase: 'Base を検索',
    searchBasePlaceholder: '名前または Token で検索',
    currentBase: '現在選択中',
    recentlyUsed: '最近使用',
    allBases: 'すべての Base',
    noSearchResults: '一致する Base がありません',
    authorizeBaseAccess: 'Base へのアクセスを認可',
    authorizingBaseAccess: '認可中…',
    baseAccessHint: '現在のアカウントでデータ認可を完了すると、アクセス可能な Base を一覧できます。',
    baseAccessPending: '認可ページを開きました。認可完了後、この一覧は自動更新されます。',
    loadSchema: 'テーブル構造を取得',
    loadingSchema: '取得中…',
    loadingBases: 'Base を読み込み中…',
    loadData: 'データを読み込む',
    loadingData: '読み込み中…',
    dataSource: 'データソース',
    advancedSettings: '詳細設定',
    showAdvanced: '詳細設定を表示',
    hideAdvanced: '詳細設定を閉じる',
    backend: 'バックエンド API',
    json: 'JSON を貼り付け',
    backendUrl: 'API URL',
    backendTip: '現在この Base を読み込めません。Base を選び直すか、時間をおいて再試行してください。',
    backendUrlRequired: 'バックエンド API URL を入力してください。',
    baseTokenRequired: '先に Base Token を入力してください。',
    invalidBasePageUrl: '現在入力されているのは Base のページ URL であり、バックエンド API ではありません。records を返す API URL を入力してください。',
    invalidSchemaEndpoint: '現在の API URL からスキーマ取得用エンドポイントを導出できません。/records で終わる API URL を使用してください。',
    schemaLoadFailed: 'テーブル構造の取得に失敗しました。',
    loadFailed: '読み込みに失敗しました。',
    requestFailed: 'リクエスト失敗',
    dataServiceUnavailable: '現在データサービスを利用できません。時間をおいて再試行してください。',
    authorizationRequired: '現在のアカウントではデータ認可が未完了です。再度認可してからお試しください。',
    permissionDenied: '現在のアカウントにはこの Base へのアクセス権がありません。別の Base を選ぶか権限を確認してください。',
    baseNotFound: 'この Base は見つかりませんでした。現在も利用可能か確認してください。',
    noTablesFound: 'この Base には利用できるテーブルがありません。別の Base を選択してください。',
    invalidSelection: '現在の選択は無効です。Base を選び直してください。',
    responseInvalid: 'レスポンス形式が不正です。records 配列がありません。',
    jsonInvalid: 'JSON 形式が不正です。records 配列がありません。',
    fullscreenToggleFailed: '全画面の切り替えに失敗しました。',
    jsonLabel: 'JSON',
    baseToken: 'Base Token',
    tableId: 'Table ID',
    selectTable: 'テーブルを選択',
    viewId: 'View ID',
    optional: '任意',
    groupField: 'グループ項目',
    startDateField: '開始日項目',
    endDateField: '終了日項目',
    titleField: 'タイトル項目',
    descriptionField: '説明項目',
    statsRule: '集計ルール',
    statsRuleValue: '同じ参照値ごとに最も早い開始日 + 最も遅い終了日',
    groupFieldPlaceholder: 'グループ化に使う項目（複数値対応）',
    startDatePlaceholder: '開始日項目を選択',
    endDatePlaceholder: '終了日項目を選択',
    fieldOptionalPlaceholder: '任意',
    detailTitle: '詳細',
    detailRange: '期間',
    detailCount: '件数',
    detailDescription: '内容',
    detailRecords: 'レコード一覧',
    expandRecords: '明細を表示',
    collapseRecords: '明細を閉じる',
    detailEmpty: '詳細はありません',
    unrecognized: '未認識',
    unknownRange: '—',
    unknownGroup: '未分類',
    recordsUnit: '件の記録',
    itemsSuffix: '件',
    dateSeparator: ' 〜 ',
    closeDetail: '詳細を閉じる',
  },
};

const safeJsonParse = <T,>(text: string): { ok: true; value: T } | { ok: false; error: string } => {
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'JSON 解析失败';
    return { ok: false, error: message };
  }
};

const formatDate = (d?: Date) => {
  if (!d) return '';
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const getStorageKey = (docRef: DocumentRef | null) => {
  if (!docRef?.docToken) return DEFAULT_STORAGE_KEY;
  return `${STORAGE_KEY_PREFIX}:${docRef.docToken}`;
};

const parseBaseLink = (raw: string) => {
  try {
    const parsed = new URL(raw.trim());
    const matched = parsed.pathname.match(/\/base\/([^/?#]+)/);
    return {
      baseToken: matched?.[1] || '',
      tableId: parsed.searchParams.get('table') || parsed.searchParams.get('tableId') || '',
      viewId: parsed.searchParams.get('view') || parsed.searchParams.get('viewId') || '',
    };
  } catch (_error) {
    return { baseToken: '', tableId: '', viewId: '' };
  }
};

const normalizeStoredConfig = (stored: Partial<TimelineConfig>): Partial<TimelineConfig> => {
  const normalized: Partial<TimelineConfig> = {
    ...stored,
    // Always trust the backend URL from the current build over stale localStorage.
    backendUrl: getDefaultBackendUrl(),
  };

  const parsedBase = parseBaseLink(typeof stored.baseLink === 'string' ? stored.baseLink : '');
  if (parsedBase.tableId && stored.tableId && parsedBase.tableId !== stored.tableId) {
    normalized.viewId = '';
    return normalized;
  }

  if (!parsedBase.viewId) {
    normalized.viewId = '';
  }

  return normalized;
};

const readRecentBases = () => {
  const parsed = safeJsonParse<RecentBaseOption[]>(localStorage.getItem(RECENT_BASES_STORAGE_KEY) || '');
  return parsed.ok && Array.isArray(parsed.value) ? parsed.value : [];
};

const writeRecentBases = (items: RecentBaseOption[]) => {
  localStorage.setItem(RECENT_BASES_STORAGE_KEY, JSON.stringify(items.slice(0, 8)));
};

const dedupeBaseOptions = (items: RecentBaseOption[]) => {
  const seen = new Set<string>();
  const result: RecentBaseOption[] = [];
  items.forEach((item) => {
    const key = item.baseToken || item.id;
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(item);
  });
  return result;
};

const sortBaseOptions = (items: RecentBaseOption[], recentItems: RecentBaseOption[]) => {
  const recentOrder = new Map(recentItems.map((item, index) => [item.baseToken, index]));
  return [...items].sort((left, right) => {
    const leftRank = recentOrder.has(left.baseToken) ? recentOrder.get(left.baseToken)! : Number.MAX_SAFE_INTEGER;
    const rightRank = recentOrder.has(right.baseToken) ? recentOrder.get(right.baseToken)! : Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  });
};

const normalizeFieldName = (value: string) => value.trim().toLowerCase();

const recommendFieldMappings = (
  fieldList: BaseField[],
  current: TimelineConfig
): Pick<TimelineConfig, 'groupField' | 'startDateField' | 'endDateField' | 'titleField' | 'descriptionField'> => {
  const fieldNames = fieldList.map((field) => field.name);
  const used = new Set<string>();

  const pick = (keywords: string[], fallback: string) => {
    if (fallback && fieldNames.includes(fallback)) {
      used.add(fallback);
      return fallback;
    }
    const found = fieldNames.find((name) => {
      if (used.has(name)) return false;
      const normalized = normalizeFieldName(name);
      return keywords.some((keyword) => normalized.includes(keyword));
    });
    if (found) used.add(found);
    return found || fallback;
  };

  const groupField = pick(['指標', 'group', '分类', '分類', '标签', 'tag', 'label'], current.groupField);
  const startDateField = pick(['开始', '開始', 'start'], current.startDateField);
  const endDateField = pick(['结束', '終了', 'end'], current.endDateField);
  const titleField = pick(['title', '标题', '名稱', '名称', 'name', 'okr', '項目'], current.titleField);
  const descriptionField = pick(['说明', '描述', 'description', 'desc', 'report', 'memo', '報告'], current.descriptionField);

  return {
    groupField,
    startDateField,
    endDateField,
    titleField,
    descriptionField,
  };
};

const mapApiErrorToMessage = (error: unknown, copy: TranslationCopy) => {
  if (!(error instanceof Error)) return copy.requestFailed;
  const code = (error as Error & { code?: string }).code || error.message;
  if (code === 'network_error') return copy.requestFailed;
  if (code === 'html_response' || code === 'invalid_json' || code === 'empty_response' || code === 'service_unavailable') {
    return copy.dataServiceUnavailable;
  }
  if (code === 'authorization_required') return copy.authorizationRequired;
  if (code === 'permission_denied') return copy.permissionDenied;
  if (code === 'base_not_found') return copy.baseNotFound;
  if (code === 'no_tables' || code === 'no_tables_found') return copy.noTablesFound;
  if (code === 'invalid_base_url' || code === 'invalid_request') return copy.invalidSelection;
  return error.message || copy.requestFailed;
};

const parseDateParts = (value: string) => {
  const matched = value.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?)?$/
  );
  if (!matched) return undefined;
  const [, year, month, day, hour = '0', minute = '0', second = '0'] = matched;
  const d = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const parseDateLike = (v: unknown): Date | undefined => {
  if (v == null) return undefined;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v;
  if (typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (!trimmed) return undefined;
    const parsedFromParts = parseDateParts(trimmed);
    if (parsedFromParts) return parsedFromParts;
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
};

const getTextLike = (v: unknown): string => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return `${v}`;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return v.map(getTextLike).filter(Boolean).join(', ');
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    const candidates = [obj.text, obj.name, obj.title, obj.value, obj.display_value];
    for (const c of candidates) {
      const t = getTextLike(c);
      if (t) return t;
    }
  }
  return '';
};

const normalizeToStringList = (v: unknown): string[] => {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map(getTextLike).map((s) => s.trim()).filter(Boolean);
  const t = getTextLike(v).trim();
  return t ? [t] : [];
};

const aggregateTimeline = (
  records: BaseRecord[],
  cfg: TimelineConfig,
  copy: TranslationCopy
): TimelineItem[] => {
  const groupKeyTo = new Map<
    string,
    {
      key: string;
      title: string;
      startAt?: Date;
      endAt?: Date;
      description?: string;
      count: number;
      entries: TimelineEntry[];
    }
  >();

  for (const r of records) {
    const fields = r.fields ?? {};
    const groupRaw = fields[cfg.groupField];
    const groupValues = normalizeToStringList(groupRaw);
    const groups = groupValues.length > 0 ? groupValues : [copy.unknownGroup];

    const startAt = parseDateLike(fields[cfg.startDateField]);
    const endAt = parseDateLike(fields[cfg.endDateField]);
    const title = getTextLike(fields[cfg.titleField]) || '';
    const description = getTextLike(fields[cfg.descriptionField]) || '';

    for (const g of groups) {
      const key = g;
      const existed = groupKeyTo.get(key);
      if (!existed) {
        groupKeyTo.set(key, {
          key,
          title: g,
          startAt,
          endAt,
          description: title || description ? [title, description].filter(Boolean).join(' · ') : undefined,
          count: 1,
          entries: [
            {
              recordId: r.record_id,
              title: title || g,
              description,
              startAt,
              endAt,
            },
          ],
        });
        continue;
      }

      existed.count += 1;
      if (startAt && (!existed.startAt || startAt.getTime() < existed.startAt.getTime())) existed.startAt = startAt;
      if (endAt && (!existed.endAt || endAt.getTime() > existed.endAt.getTime())) existed.endAt = endAt;
      if (!existed.description && (title || description)) {
        existed.description = [title, description].filter(Boolean).join(' · ');
      }
      existed.entries.push({
        recordId: r.record_id,
        title: title || g,
        description,
        startAt,
        endAt,
      });
    }
  }

  return Array.from(groupKeyTo.values())
    .map((x) => ({
      key: x.key,
      title: x.title,
      description: x.description ? `${x.description} (${x.count} ${copy.itemsSuffix})` : `${x.count} ${copy.recordsUnit}`,
      startAt: x.startAt,
      endAt: x.endAt,
      count: x.count,
      entries: x.entries,
    }))
    .sort((a, b) => {
      const at = a.startAt?.getTime() ?? Number.POSITIVE_INFINITY;
      const bt = b.startAt?.getTime() ?? Number.POSITIVE_INFINITY;
      if (at !== bt) return at - bt;
      return a.title.localeCompare(b.title);
    });
};

export default () => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [runtimeContext, setRuntimeContext] = useState<RuntimeContext>({
    docRef: null,
    storageKey: DEFAULT_STORAGE_KEY,
  });
  const [isConfigReady, setIsConfigReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isBasePickerOpen, setIsBasePickerOpen] = useState(false);
  const [detailState, setDetailState] = useState<DetailState>(null);
  const [isDetailListOpen, setIsDetailListOpen] = useState(false);
  const [drawerWidth, setDrawerWidth] = useState(720);
  const [isLoading, setIsLoading] = useState(false);
  const [isSchemaLoading, setIsSchemaLoading] = useState(false);
  const [isBaseListLoading, setIsBaseListLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [records, setRecords] = useState<BaseRecord[]>([]);
  const [tables, setTables] = useState<BaseTable[]>([]);
  const [fields, setFields] = useState<BaseField[]>([]);
  const [recentBases, setRecentBases] = useState<RecentBaseOption[]>([]);
  const [availableBases, setAvailableBases] = useState<RecentBaseOption[]>([]);
  const [baseSearchQuery, setBaseSearchQuery] = useState('');
  const [basePickerActiveIndex, setBasePickerActiveIndex] = useState(0);
  const [authState, setAuthState] = useState('');
  const [isAuthorizingBaseAccess, setIsAuthorizingBaseAccess] = useState(false);
  const [authStatus, setAuthStatus] = useState<'idle' | 'pending' | 'authorized' | 'failed'>('idle');
  const [cfg, setCfg] = useState<TimelineConfig>(createDefaultConfig);

  const setCfgField = useCallback(
    <K extends keyof TimelineConfig>(key: K) =>
      (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const nextValue = e.target.value as TimelineConfig[K];
        setCfg((s) => {
          if (key === 'tableId') {
            return {
              ...s,
              tableId: nextValue as TimelineConfig['tableId'],
              // View ids are scoped to a table, so keep them from leaking across table switches.
              viewId: '',
            };
          }
          return { ...s, [key]: nextValue };
        });
      },
    []
  );

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (!isSettingsOpen) return;
      if ((document.body.dataset.drawerResizing || '') !== '1') return;
      const nextWidth = Math.min(Math.max(window.innerWidth - event.clientX, 560), window.innerWidth - 24);
      setDrawerWidth(nextWidth);
    };
    const onMouseUp = () => {
      if (document.body.dataset.drawerResizing === '1') {
        document.body.dataset.drawerResizing = '0';
      }
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isSettingsOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSettingsOpen(false);
        setDetailState(null);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    (async () => {
      const docRef = await DocMiniApp.getActiveDocumentRef();
      const storageKey = getStorageKey(docRef);
      const parsed = safeJsonParse<Partial<TimelineConfig>>(localStorage.getItem(storageKey) || '');
      const storedConfig = parsed.ok ? normalizeStoredConfig(parsed.value || {}) : {};
      setRuntimeContext({ docRef, storageKey });
      setCfg((prev) => ({
        ...createDefaultConfig(),
        ...prev,
        ...storedConfig,
      }));
      setIsConfigReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!isConfigReady) return;
    localStorage.setItem(runtimeContext.storageKey, JSON.stringify(cfg));
  }, [cfg, isConfigReady, runtimeContext.storageKey]);

  useEffect(() => {
    setRecentBases(readRecentBases());
  }, []);

  useEffect(() => {
    if (!cfg.baseToken || !cfg.baseLink) return;
    const fallbackItem: RecentBaseOption = {
      id: cfg.baseToken,
      name: cfg.tableId || cfg.baseToken,
      url: cfg.baseLink,
      baseToken: cfg.baseToken,
      tableId: cfg.tableId,
      viewId: cfg.viewId,
    };
    setRecentBases((prev) => {
      if (prev.some((item) => item.baseToken === fallbackItem.baseToken)) {
        return prev;
      }
      const next = [fallbackItem, ...prev].slice(0, 8);
      writeRecentBases(next);
      return next;
    });
  }, [cfg.baseLink, cfg.baseToken, cfg.tableId, cfg.viewId]);

  const [systemLanguage, setSystemLanguage] = useState<Exclude<UILanguage, 'system'>>('en-US');

  useEffect(() => {
    (async () => {
      try {
        const lang = await DocMiniApp.Env.Language.getLanguage();
        const normalized = typeof lang === 'string' ? lang.toLowerCase() : '';
        if (normalized.startsWith('zh')) {
          setSystemLanguage('zh-CN');
          return;
        }
        if (normalized.startsWith('ja')) {
          setSystemLanguage('ja-JP');
          return;
        }
        if (normalized.startsWith('en')) {
          setSystemLanguage('en-US');
          return;
        }
      } catch (_error) {
        const fallback = navigator.language.toLowerCase();
        if (fallback.startsWith('zh')) {
          setSystemLanguage('zh-CN');
          return;
        }
        if (fallback.startsWith('ja')) {
          setSystemLanguage('ja-JP');
          return;
        }
      }
      setSystemLanguage('en-US');
    })();
  }, []);

  const activeLanguage = cfg.uiLanguage === 'system' ? systemLanguage : cfg.uiLanguage;
  const t = translations[activeLanguage];

  const timelineItems = useMemo(() => aggregateTimeline(records, cfg, t), [records, cfg, t]);
  const fieldNames = useMemo(() => fields.map((item) => item.name), [fields]);
  const selectedBase = useMemo(
    () => [...availableBases, ...recentBases].find((item) => item.baseToken === cfg.baseToken) || null,
    [availableBases, recentBases, cfg.baseToken]
  );
  const baseOptions = useMemo(
    () => sortBaseOptions(dedupeBaseOptions([...recentBases, ...availableBases]), recentBases),
    [availableBases, recentBases]
  );
  const filteredBaseOptions = useMemo(() => {
    const keyword = baseSearchQuery.trim().toLowerCase();
    if (!keyword) {
      return baseOptions;
    }
    return baseOptions.filter((item) => {
      const name = item.name.toLowerCase();
      const token = item.baseToken.toLowerCase();
      return name.includes(keyword) || token.includes(keyword);
    });
  }, [baseOptions, baseSearchQuery]);
  const recentBaseSet = useMemo(() => new Set(recentBases.map((item) => item.baseToken)), [recentBases]);
  const recentFilteredBases = useMemo(
    () => filteredBaseOptions.filter((item) => recentBaseSet.has(item.baseToken)),
    [filteredBaseOptions, recentBaseSet]
  );
  const otherFilteredBases = useMemo(
    () => filteredBaseOptions.filter((item) => !recentBaseSet.has(item.baseToken)),
    [filteredBaseOptions, recentBaseSet]
  );

  useEffect(() => {
    setBasePickerActiveIndex(0);
  }, [baseSearchQuery, isBasePickerOpen]);

  const formatDateRange = useCallback(
    (startAt?: Date, endAt?: Date) => {
      if (!startAt && !endAt) return t.unknownRange;
      return `${formatDate(startAt) || t.unknownRange}${t.dateSeparator}${formatDate(endAt) || t.unknownRange}`;
    },
    [t]
  );

  const loadBaseOptions = useCallback(async () => {
    setIsBaseListLoading(true);
    try {
      const json = (await api.fetchBaseList(cfg.backendUrl, authState || undefined)) as BaseListResponse;
      setAvailableBases(Array.isArray(json.items) ? dedupeBaseOptions(json.items) : []);
      setAuthStatus((prev) => (prev === 'pending' ? 'authorized' : prev));
      setError('');
    } catch (_e) {
      setAvailableBases([]);
      const message = mapApiErrorToMessage(_e, t);
      setError(message);
      if ((_e as Error & { code?: string }).code === 'authorization_required') {
        setAuthStatus((prev) => (prev === 'pending' ? 'pending' : 'failed'));
      }
    } finally {
      setIsBaseListLoading(false);
    }
  }, [authState, cfg.backendUrl, t]);

  useEffect(() => {
    if (!isConfigReady) return;
    void loadBaseOptions();
  }, [cfg.backendUrl, isConfigReady, loadBaseOptions]);

  useEffect(() => {
    if (!authState || authStatus !== 'pending') {
      return;
    }
    const timer = window.setInterval(async () => {
      try {
        const json = (await api.fetchLarkAuthSession(cfg.backendUrl, authState)) as AuthSessionResponse;
        if (json.status === 'authorized') {
          setAuthStatus('authorized');
          setIsAuthorizingBaseAccess(false);
          window.clearInterval(timer);
          void loadBaseOptions();
          return;
        }
        if (json.status === 'failed') {
          setAuthStatus('failed');
          setIsAuthorizingBaseAccess(false);
          window.clearInterval(timer);
          if (json.error) {
            setError(json.error);
          }
        }
      } catch (_error) {
        // Ignore transient polling failures and let the next interval retry.
      }
    }, 1500);

    return () => window.clearInterval(timer);
  }, [authState, authStatus, cfg.backendUrl, loadBaseOptions]);

  const startBaseAuthorization = useCallback(async () => {
    setIsAuthorizingBaseAccess(true);
    setError('');
    try {
      const json = (await api.startLarkAuth(cfg.backendUrl)) as AuthStartResponse;
      setAuthState(json.state);
      setAuthStatus('pending');
      window.open(json.authorizeUrl, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setIsAuthorizingBaseAccess(false);
      setAuthStatus('failed');
      setError(mapApiErrorToMessage(e, t));
    }
  }, [cfg.backendUrl, t]);

  const applyBaseSelection = useCallback(
    (option: RecentBaseOption) => {
      setCfg((prev) => ({
        ...prev,
        baseLink: option.url,
        baseToken: option.baseToken,
        tableId: option.tableId || '',
        viewId: option.viewId || '',
      }));
      setTables([]);
      setFields([]);
      setRecords([]);
      setError('');
      setBaseSearchQuery('');
      setBasePickerActiveIndex(0);
      setIsBasePickerOpen(false);
      setRecentBases((prev) => {
        const next = [option, ...prev.filter((item) => item.baseToken !== option.baseToken)].slice(0, 8);
        writeRecentBases(next);
        return next;
      });
    },
    []
  );

  const loadSchema = useCallback(async () => {
    setError('');
    setIsSchemaLoading(true);
    try {
      const baseToken = cfg.baseToken.trim();
      if (!baseToken) {
        throw new Error(t.baseTokenRequired);
      }
      const json = (await api.fetchBaseSchema(cfg.backendUrl, {
        baseToken,
        tableId: cfg.tableId.trim() || undefined,
      })) as BaseSchemaResponse & { error?: string };

      setTables(Array.isArray(json.tables) ? json.tables : []);
      setFields(Array.isArray(json.fields) ? json.fields : []);

      setCfg((prev) => {
        const next = { ...prev };
        if (!prev.tableId && json.tables?.[0]?.id) {
          next.tableId = json.tables[0].id;
        }
        Object.assign(next, recommendFieldMappings(json.fields || [], next));
        return next;
      });
    } catch (e) {
      const message = mapApiErrorToMessage(e, t);
      setError(message);
    } finally {
      setIsSchemaLoading(false);
    }
  }, [
    cfg.baseToken,
    cfg.tableId,
    t.baseTokenRequired,
    t.requestFailed,
    t.schemaLoadFailed,
  ]);

  useEffect(() => {
    if (!isConfigReady) return;
    if (cfg.mode !== 'backend') return;
    if (!cfg.baseToken.trim()) return;
    void loadSchema();
  }, [cfg.mode, cfg.baseToken, cfg.tableId, isConfigReady, loadSchema]);

  const loadData = useCallback(async () => {
    setError('');
    setIsLoading(true);
    try {
      const json = (await api.fetchBaseRecords(cfg.backendUrl, {
        baseToken: cfg.baseToken.trim(),
        tableId: cfg.tableId.trim(),
        viewId: cfg.viewId.trim() || undefined,
      })) as BaseRecordsResponse & { error?: string };
      if (!json?.records || !Array.isArray(json.records)) throw new Error(t.responseInvalid);
      setRecords(json.records.map((r) => ({ record_id: r.record_id, fields: r.fields ?? {} })));
    } catch (e) {
      const message = mapApiErrorToMessage(e, t);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [
    cfg,
    t.loadFailed,
    t.requestFailed,
    t.responseInvalid,
  ]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await rootRef.current?.requestFullscreen();
    } catch (e) {
      const message = e instanceof Error ? e.message : t.fullscreenToggleFailed;
      setError(message);
    }
  }, [t.fullscreenToggleFailed]);

  return (
    <div ref={rootRef} className={`timeline-root ${isFullscreen ? 'is-fullscreen' : ''}`}>
      <div className="timeline-toolbar">
        <div className="timeline-title">{t.timeline}</div>
        <div className="timeline-toolbar-actions">
          <button className="btn btn-secondary" onClick={toggleFullscreen}>
            {isFullscreen ? t.exitFullscreen : t.fullscreen}
          </button>
          <button className="gear-btn" onClick={() => setIsSettingsOpen(true)} aria-label={t.openSettings} title={t.settings}>
            <svg viewBox="0 0 24 24" aria-hidden="true" className="gear-icon">
              <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.21 7.21 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.49-.42h-3.84a.5.5 0 0 0-.49.42l-.36 2.54c-.58.23-1.13.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.82 14.52a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.4 1.05.72 1.63.94l.36 2.54a.5.5 0 0 0 .49.42h3.84a.5.5 0 0 0 .49-.42l.36-2.54c.58-.23 1.13-.54 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z" />
            </svg>
          </button>
        </div>
      </div>

      <div className="timeline-content">
        {timelineItems.length === 0 ? (
          <div className="timeline-empty">{t.empty}</div>
        ) : (
          <div className="timeline-scroll">
            <div className="timeline-scroll-inner">
              <div className="timeline-track">
                <div className="timeline-line" />
                {timelineItems.map((item, idx) => {
                  const positionClass = idx % 2 === 0 ? 'pos-top' : 'pos-bottom';
                  const rangeText = formatDateRange(item.startAt, item.endAt);
                  return (
                    <div key={item.key} className={`timeline-item ${positionClass}`}>
                      <button
                        type="button"
                        className="timeline-bubble bubble-button"
                        onClick={() => {
                          setDetailState({ item, rangeText });
                          setIsDetailListOpen(false);
                        }}
                      >
                        <div className="bubble-title">{item.title}</div>
                        <div className="bubble-desc">{item.description || ''}</div>
                      </button>
                      <div className="timeline-dot" />
                      <div className="timeline-time">{rangeText}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={`settings-overlay ${isSettingsOpen ? 'is-open' : ''}`} onClick={() => setIsSettingsOpen(false)} />
      <aside className={`settings-drawer ${isSettingsOpen ? 'is-open' : ''}`} style={{ width: `${drawerWidth}px` }}>
        <div
          className="settings-resize-handle"
          onMouseDown={() => {
            document.body.dataset.drawerResizing = '1';
          }}
        />
        <div className="settings-header">
          <div>
            <div className="settings-title">{t.settings}</div>
            <div className="config-meta">{t.currentDoc}: {runtimeContext.docRef?.docToken || t.unrecognized}</div>
          </div>
          <button className="icon-btn" onClick={() => setIsSettingsOpen(false)}>
            {t.close}
          </button>
        </div>

        <div className="settings-actions">
          <button className="btn btn-secondary" onClick={loadBaseOptions} disabled={isBaseListLoading}>
            {isBaseListLoading ? t.loadingBases : t.chooseBase}
          </button>
          <button className="btn" onClick={loadData} disabled={isLoading}>
            {isLoading ? t.loadingData : t.loadData}
          </button>
        </div>

        <div className="timeline-config settings-content">
          <div className="config-row">
            <label className="config-label">{t.language}</label>
            <select
              className="config-input"
              value={cfg.uiLanguage}
              onChange={(e) => setCfg((s) => ({ ...s, uiLanguage: e.target.value as UILanguage }))}
            >
              <option value="system">{t.system}</option>
              <option value="zh-CN">{t.chinese}</option>
              <option value="en-US">{t.english}</option>
              <option value="ja-JP">{t.japanese}</option>
            </select>
          </div>
          <div className="config-row">
            <label className="config-label">{t.selectedBase}</label>
            <div className="base-selector">
              <select
                className="config-input"
                value={cfg.baseToken}
                onChange={(e) => {
                  const next = baseOptions.find((item) => item.baseToken === e.target.value);
                  if (next) {
                    applyBaseSelection(next);
                  }
                }}
              >
                <option value="">{isBaseListLoading ? t.loadingBases : t.noBaseSelected}</option>
                {baseOptions.map((base) => (
                  <option key={base.baseToken} value={base.baseToken}>
                    {base.name}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setBaseSearchQuery('');
                  setIsBasePickerOpen(true);
                }}
              >
                {selectedBase ? t.changeBase : t.chooseBase}
              </button>
            </div>
          </div>

          <div className="config-grid">
            <div className="config-row">
              <label className="config-label">{t.tableId}</label>
              {tables.length > 0 ? (
                <select className="config-input" value={cfg.tableId} onChange={setCfgField('tableId')}>
                  <option value="">{t.selectTable}</option>
                  {tables.map((table) => (
                    <option key={table.id} value={table.id}>
                      {table.name} ({table.id})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="config-input"
                  value={cfg.tableId}
                  onChange={setCfgField('tableId')}
                />
              )}
            </div>
          </div>

          <div className="config-grid">
            <div className="config-row">
              <label className="config-label">{t.groupField}</label>
              <input
                className="config-input"
                list="timeline-field-options"
                value={cfg.groupField}
                onChange={setCfgField('groupField')}
                placeholder={t.groupFieldPlaceholder}
              />
            </div>
            <div className="config-row">
              <label className="config-label">{t.startDateField}</label>
              <input
                className="config-input"
                list="timeline-field-options"
                value={cfg.startDateField}
                onChange={setCfgField('startDateField')}
                placeholder={t.startDatePlaceholder}
              />
            </div>
            <div className="config-row">
              <label className="config-label">{t.endDateField}</label>
              <input
                className="config-input"
                list="timeline-field-options"
                value={cfg.endDateField}
                onChange={setCfgField('endDateField')}
                placeholder={t.endDatePlaceholder}
              />
            </div>
          </div>

          <button className="link-btn" onClick={() => setIsAdvancedOpen((prev) => !prev)}>
            {isAdvancedOpen ? t.hideAdvanced : t.showAdvanced}
          </button>
          {isAdvancedOpen ? (
            <div className="advanced-panel">
              <div className="config-row">
                <label className="config-label">{t.baseToken}</label>
                <input
                  className="config-input"
                  value={cfg.baseToken}
                  onChange={setCfgField('baseToken')}
                />
              </div>
              <div className="config-row">
                <label className="config-label">{t.viewId}</label>
                <input
                  className="config-input"
                  value={cfg.viewId}
                  onChange={setCfgField('viewId')}
                  placeholder={t.optional}
                />
              </div>
              <div className="config-tip">{t.backendTip}</div>
              <div className="settings-actions settings-actions-compact">
                <button className="btn btn-secondary" onClick={loadSchema} disabled={isSchemaLoading}>
                  {isSchemaLoading ? t.loadingSchema : t.loadSchema}
                </button>
              </div>
            </div>
          ) : null}

          <div className="config-grid">
            <div className="config-row">
              <label className="config-label">{t.titleField}</label>
              <input
                className="config-input"
                list="timeline-field-options"
                value={cfg.titleField}
                onChange={setCfgField('titleField')}
                placeholder={t.fieldOptionalPlaceholder}
              />
            </div>
            <div className="config-row">
              <label className="config-label">{t.descriptionField}</label>
              <input
                className="config-input"
                list="timeline-field-options"
                value={cfg.descriptionField}
                onChange={setCfgField('descriptionField')}
                placeholder={t.fieldOptionalPlaceholder}
              />
            </div>
            <div className="config-row">
              <label className="config-label">{t.statsRule}</label>
              <div className="config-hint">{t.statsRuleValue}</div>
            </div>
          </div>

          {error ? <div className="config-error">{error}</div> : null}
          {fieldNames.length > 0 ? (
            <datalist id="timeline-field-options">
              {fieldNames.map((fieldName) => (
                <option key={fieldName} value={fieldName} />
              ))}
            </datalist>
          ) : null}
        </div>
      </aside>

      <div className={`settings-overlay ${detailState ? 'is-open' : ''}`} onClick={() => setDetailState(null)} />
      {detailState ? (
        <div className="detail-modal">
          <div className="detail-header">
            <div className="detail-title">{t.detailTitle}</div>
            <button className="icon-btn" onClick={() => setDetailState(null)}>
              {t.close}
            </button>
          </div>
          <div className="detail-section">
            <div className="detail-item-title">{detailState.item.title}</div>
            <div className="detail-meta">
              <span>{t.detailRange}: {detailState.rangeText}</span>
              <span>{t.detailCount}: {detailState.item.count}</span>
            </div>
          </div>
          <div className="detail-section">
            <div className="detail-label">{t.detailDescription}</div>
            <div className="detail-body">{detailState.item.description || t.detailEmpty}</div>
          </div>
          {detailState.item.entries.length > 0 ? (
            <div className="detail-section">
              <button className="detail-expand-btn" onClick={() => setIsDetailListOpen((prev) => !prev)}>
                <span>{t.detailRecords}: {detailState.item.entries.length}</span>
                <span>{isDetailListOpen ? t.collapseRecords : t.expandRecords}</span>
              </button>
              {isDetailListOpen ? (
                <div className="detail-record-list">
                  {detailState.item.entries.map((entry, index) => (
                    <div key={`${entry.recordId || 'entry'}-${index}`} className="detail-record-card">
                      <div className="detail-record-title">{entry.title}</div>
                      <div className="detail-record-range">{formatDateRange(entry.startAt, entry.endAt)}</div>
                      <div className="detail-record-desc">{entry.description || t.detailEmpty}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={`settings-overlay ${isBasePickerOpen ? 'is-open' : ''}`} onClick={() => setIsBasePickerOpen(false)} />
      {isBasePickerOpen ? (
        <div className="base-picker-modal">
          <div className="detail-header">
            <div className="detail-title">{t.chooseBase}</div>
            <button className="icon-btn" onClick={() => setIsBasePickerOpen(false)}>
              {t.close}
            </button>
          </div>
          <div className="detail-section">
            <div className="config-row">
              <label className="config-label">{t.searchBase}</label>
              <input
                className="config-input"
                value={baseSearchQuery}
                onChange={(e) => setBaseSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setBaseSearchQuery('');
                    setIsBasePickerOpen(false);
                    return;
                  }
                  if (filteredBaseOptions.length === 0) {
                    return;
                  }
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setBasePickerActiveIndex((prev) => (prev + 1) % filteredBaseOptions.length);
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setBasePickerActiveIndex((prev) => (prev - 1 + filteredBaseOptions.length) % filteredBaseOptions.length);
                    return;
                  }
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const next = filteredBaseOptions[basePickerActiveIndex] || filteredBaseOptions[0];
                    if (next) {
                      applyBaseSelection(next);
                    }
                  }
                }}
                placeholder={t.searchBasePlaceholder}
              />
            </div>
            {filteredBaseOptions.length > 0 ? (
              <>
                {recentFilteredBases.length > 0 ? (
                  <div className="base-list-group">
                    <div className="detail-label">{t.recentlyUsed}</div>
                    <div className="base-list">
                      {recentFilteredBases.map((base) => {
                        const activeBase = filteredBaseOptions[basePickerActiveIndex];
                        return (
                          <button
                            key={base.id}
                            className={`base-list-item ${base.baseToken === cfg.baseToken ? 'is-active' : ''} ${activeBase?.baseToken === base.baseToken ? 'is-keyboard-active' : ''}`}
                            onClick={() => applyBaseSelection(base)}
                          >
                            <div className="base-list-name">{base.name}</div>
                            <div className="base-list-sub">{base.baseToken}</div>
                            <div className="base-list-action">
                              {base.baseToken === cfg.baseToken ? t.currentBase : t.useThisBase}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                {otherFilteredBases.length > 0 ? (
                  <div className="base-list-group">
                    <div className="detail-label">{t.allBases}</div>
                    <div className="base-list">
                      {otherFilteredBases.map((base) => {
                        const activeBase = filteredBaseOptions[basePickerActiveIndex];
                        return (
                          <button
                            key={base.id}
                            className={`base-list-item ${base.baseToken === cfg.baseToken ? 'is-active' : ''} ${activeBase?.baseToken === base.baseToken ? 'is-keyboard-active' : ''}`}
                            onClick={() => applyBaseSelection(base)}
                          >
                            <div className="base-list-name">{base.name}</div>
                            <div className="base-list-sub">{base.baseToken}</div>
                            <div className="base-list-action">
                              {base.baseToken === cfg.baseToken ? t.currentBase : t.useThisBase}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </>
            ) : authStatus !== 'authorized' && !baseSearchQuery.trim() ? (
              <div className="detail-section">
                <div className="config-hint">{authStatus === 'pending' ? t.baseAccessPending : t.baseAccessHint}</div>
                <div className="settings-actions settings-actions-compact">
                  <button className="btn btn-secondary" onClick={startBaseAuthorization} disabled={isAuthorizingBaseAccess}>
                    {isAuthorizingBaseAccess ? t.authorizingBaseAccess : t.authorizeBaseAccess}
                  </button>
                </div>
              </div>
            ) : (
              <div className="config-hint">{baseSearchQuery.trim() ? t.noSearchResults : t.noRecentBases}</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};
