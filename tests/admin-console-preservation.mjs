import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
const consoleJs = fs.readFileSync(path.join(root, 'assets/js/admin-console.js'), 'utf8');
const logsJs = fs.readFileSync(path.join(root, 'assets/js/admin-user-logs.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/css/style.css'), 'utf8');

function mustInclude(hay, needle, label) {
  assert.ok(hay.includes(needle), `missing ${label}: ${needle}`);
}

const requiredIds = [
  'adminGate', 'loginBtn', 'logoutBtn', 'langBtn', 'adminSaveMsg',
  'adminCrm', 'adminCrmStats', 'adminHomeStats', 'adminUserSearch',
  'adminUserLicenseStatus', 'adminUserSort', 'adminCrmFilterOrders', 'adminCrmFilterTickets',
  'adminUserCount', 'adminCrmPager', 'adminCrmSelectAll', 'adminCrmBulkbar', 'adminCrmBulkCount',
  'adminUserList', 'adminCrmDetail', 'adminCrmEmpty', 'adminCrmSkeleton', 'adminCrmDetailBody',
  'adminCrmAvatar', 'adminCrmName', 'adminCrmRoleBadge', 'adminCrmHeaderLicense',
  'adminCrmEmail', 'adminCrmUid', 'adminCrmHeaderMeta', 'adminCrmFavBtn', 'adminCrmMenuBtn', 'adminCrmMenu',
  'adminCrmSummary', 'adminCrmHwidBox', 'adminCrmAccessBox',
  'adminUserRole', 'adminLicensePlan', 'adminLicenseStartsAt', 'adminLicenseExpiresAt', 'adminLicenseMemo',
  'adminCrmFloatSave', 'adminCrmUsage', 'adminCrmOrders', 'adminCrmTickets', 'adminCrmPosts',
  'adminCrmPostsSelectAll', 'adminCrmPostsDeleteSelected', 'adminCrmPostsDeleteAll',
  'adminCrmUserMemo', 'adminCrmMemoHistory', 'adminCrmTimeline', 'adminCrmRecentFeed',
  'adminCrmOrderDrawer', 'adminLogsSection', 'adminLogsUserSearch', 'adminLogsTableSearch',
  'adminLogsDateFilter', 'adminLogsRefreshBtn', 'adminLogsLoadMore',
  'adminPricingSection', 'pricingAddProduct', 'pricingAddRegion', 'pricingSaveBtn',
  'pricingProductList', 'pricingEditor', 'pricingLangKo', 'pricingLangEn', 'pricingLangJa',
  'pricingSaveLangMap', 'pricingSavePromoBtn', 'promoEnabled', 'promoPopupEnabled',
  'adminTicketsSection', 'adminTicketSearch', 'adminTicketStatus', 'adminTicketCount',
  'adminTicketList', 'adminTicketDeleteSelected', 'adminTicketDeleteAll',
  'adminPaymentsSection', 'adminPaymentsList', 'adminPaymentsSearch',
  'adminContentSection', 'adminSidebar', 'adminConsoleTitle'
];

for (const id of requiredIds) mustInclude(html, `id="${id}"`, 'admin.html id');

const requiredActions = [
  'data-bulk="ban"', 'data-bulk="app-message"', 'data-bulk="delete"',
  'data-crm-action="hwid-reset"', 'data-crm-action="app-message"', 'data-crm-action="delete"',
  'data-crm-action="orders-more"', 'data-crm-action="tickets-tab"', 'data-crm-action="open-logs"',
  'data-crm-action="back-list"', 'data-crm-action="toggle-fav"',
  'data-crm-action="posts-delete-selected"', 'data-crm-action="posts-delete-all"',
  'data-crm-action="close-order-drawer"'
];
for (const a of requiredActions) mustInclude(html, a, 'admin.html action');

mustInclude(app, "action==='hwid-reveal'", 'hwid reveal action');
mustInclude(app, "action==='hwid-copy'", 'hwid copy action');
mustInclude(app, "action==='ban'", 'ban action');

mustInclude(html, '이메일, 이름, UID, HWID 검색', 'member search');
mustInclude(html, 'option value="trial"', 'license filter trial');
mustInclude(html, 'option value="lifetime"', 'license filter lifetime');
mustInclude(html, 'option value="period"', 'license filter period');
mustInclude(html, 'option value="favorites"', 'license filter favorites');
mustInclude(html, 'option value="lastLogin"', 'sort last login');
mustInclude(html, 'adminCrmFilterOrders', 'orders filter');
mustInclude(html, 'option value="closed"', 'ticket closed filter');
mustInclude(html, 'data-logs-tab="hwid"', 'logs hwid tab');
mustInclude(html, 'data-logs-tab="app"', 'logs app tab');
mustInclude(html, 'href="./notices.html"', 'cms notices');
mustInclude(html, 'href="./patch-notes.html"', 'cms patch');
mustInclude(html, 'href="./faq.html"', 'cms faq');
mustInclude(html, 'href="./board.html"', 'cms board');
mustInclude(html, 'class="admin-sidebar"', 'sidebar');
mustInclude(html, 'admin-nav.js', 'classic nav script');
mustInclude(consoleJs, '__midiaiShowAdminViewCore', 'nav core hook');
assert.ok(!html.includes('admin-float-nav'), 'old floating nav must be removed');

mustInclude(app, 'applyAdminCrmStatFilter', 'stat filter handler');
mustInclude(app, 'adminResetHwid', 'hwid reset handler');
mustInclude(app, 'adminDeleteUser', 'delete handler');
mustInclude(app, 'notifyAdminAppMessage', 'app message handler');
mustInclude(app, 'saveAdminCrmAllChanges', 'license save handler');
mustInclude(app, 'openAdminCrmOrderDrawer', 'order drawer handler');
mustInclude(app, 'adminQuickLicense', 'license grant handler');
mustInclude(app, 'writeAdminAuditLog', 'audit log handler');
mustInclude(app, "getAttribute('data-bulk')", 'bulk action wiring');
mustInclude(app, 'adminCrmMemberRowHtml', 'member table row');
mustInclude(app, 'setAdminCrmDetailTab', 'detail tabs');
mustInclude(app, 'renderAdminPaymentsTable', 'payments table');
mustInclude(app, "classList.contains('admin-console-page')", 'skip public sidebar on admin console');

mustInclude(consoleJs, 'export function showAdminView', 'view switcher');
mustInclude(logsJs, 'export function setAdminLogsTab', 'logs tab api');
mustInclude(logsJs, 'export function selectAdminLogsUser', 'logs user api');
mustInclude(css, '.admin-console-page .admin-sidebar', 'console css scoped');
mustInclude(css, '.admin-console-page .admin-crm-detail [data-tab-panel]', 'detail tab css');

console.log('admin-console-preservation: PASS', requiredIds.length, 'ids');
