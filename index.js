const express = require("express");
const crypto = require("crypto");
const line = require("@line/bot-sdk");
const { Client } = require("@notionhq/client");

// 環境變數設定
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const NOTION_TOKEN = process.env.NOTION_INTEGRATION_TOKEN;

// Notion 資料庫 ID
const DATABASE_IDS = {
  product: "3a87922f-9574-8184-b18a-fe3e521e2d49",
  supplier: "3a87922f-9574-81ef-b75b-c5f06d137a61",
  customer: "3a87922f-9574-812a-914b-d90506c7df52",
  case: "3a87922f-9574-8158-9819-d0e21683c5dc",
  order: "3a87922f-9574-8192-a634-e4f7439c9dd5",
  quote: "3a87922f-9574-810d-b88e-feb49265ad8f",
};

// Notion 客戶端
const notion = new Client({ auth: NOTION_TOKEN });

// LINE 客戶端
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken,
});

// 用戶角色映射
const userRoles = {};

const app = express();

// 使用 express.json() 解析 JSON body
app.use(express.json());

// 健康檢查端點
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "居家安全達人 LINE Bot is running" });
});

/**
 * 驗證 LINE 簽章
 * @param {string} body - 原始 request body
 * @param {string} signature - X-Line-Signature header
 * @returns {boolean} - 簽章是否有效
 */
function verifyLineSignature(body, signature) {
  if (!config.channelSecret || !signature) {
    console.warn("Channel Secret 或 Signature 缺失，跳過驗證");
    return true; // 開發環境允許通過
  }

  const hash = crypto
    .createHmac("sha256", config.channelSecret)
    .update(body, "utf8")
    .digest("base64");

  return hash === signature;
}

// Webhook 端點 - 手動驗證簽章
app.post("/webhook", (req, res) => {
  const signature = req.headers["x-line-signature"];
  const body = JSON.stringify(req.body);

  // 驗證簽章
  if (!verifyLineSignature(body, signature)) {
    console.error("簽章驗證失敗");
    return res.status(401).json({ error: "Invalid signature" });
  }

  // 處理 LINE 驗證請求（空 events 陣列）
  const events = req.body.events || [];
  
  if (events.length === 0) {
    console.log("收到 LINE 驗證請求");
    return res.json({ message: "OK" });
  }

  // 處理實際事件
  Promise.all(events.map(handleEvent))
    .then((result) => {
      console.log("事件處理完成");
      res.json(result);
    })
    .catch((err) => {
      console.error("Webhook 處理錯誤:", err);
      res.status(500).json({ error: err.message });
    });
});

// 主要事件處理
async function handleEvent(event) {
  if (event.type !== "message" || event.message.type !== "text") {
    return Promise.resolve(null);
  }

  const messageText = event.message.text.trim();
  const replyToken = event.replyToken;
  const userId = event.source.userId;

  console.log(`用戶 ${userId} 的訊息: ${messageText}`);

  let replyMessage = { type: "text", text: "" };

  // 角色切換指令
  if (["管理者", "評估", "報價", "派工", "施工", "財務"].includes(messageText)) {
    userRoles[userId] = messageText;
    replyMessage.text = `已切換至【${messageText}】模式。\n\n${getRoleHelp(messageText)}`;
  } else if (messageText === "幫助" || messageText === "help") {
    replyMessage.text = getMainHelp();
  } else if (messageText === "目前角色") {
    const role = userRoles[userId] || "未設定";
    replyMessage.text = `您目前的角色是：【${role}】\n\n輸入角色名稱可切換：管理者、評估、報價、派工、施工、財務`;
  } else {
    // 根據角色處理指令
    const role = userRoles[userId];
    if (!role) {
      replyMessage.text = "請先選擇角色！\n\n可用角色：\n• 管理者\n• 評估\n• 報價\n• 派工\n• 施工\n• 財務\n\n輸入角色名稱即可切換。";
    } else {
      replyMessage.text = await handleRoleCommand(role, messageText, userId);
    }
  }

  return client.replyMessage({ replyToken, messages: [replyMessage] });
}

// 主選單幫助
function getMainHelp() {
  return `【居家安全達人】指令說明\n\n` +
    `📋 角色切換：\n` +
    `• 管理者 - 管理品項與供應商\n` +
    `• 評估 - 客戶評估與資料蒐集\n` +
    `• 報價 - 方案與報價管理\n` +
    `• 派工 - 安排師傅與工期\n` +
    `• 施工 - 進度回報與完工\n` +
    `• 財務 - 收付款與帳期\n\n` +
    `📌 其他指令：\n` +
    `• 幫助 - 顯示此選單\n` +
    `• 目前角色 - 查看當前角色`;
}

// 角色幫助
function getRoleHelp(role) {
  const helps = {
    "管理者": `【管理者】可用指令：\n• 新增產品 [名稱] [售價] [成本]\n• 新增供應商 [名稱] [聯絡人] [電話]\n• 查詢產品\n• 查詢供應商`,
    "評估": `【評估人員】可用指令：\n• 新增客戶 [姓名] [電話] [地址]\n• 新增案件 [客戶姓名] [風險區域]\n• 查詢客戶\n• 查詢案件`,
    "報價": `【報價/業務】可用指令：\n• 新增報價 [客戶姓名] [金額]\n• 確認報價 [報價編號]\n• 查詢報價`,
    "派工": `【派工人員】可用指令：\n• 新增派工 [訂單編號] [供應商] [日期]\n• 查詢派工\n• 更新狀態 [訂單編號] [狀態]`,
    "施工": `【施工/供應商】可用指令：\n• 回報進度 [訂單編號] [進度說明]\n• 完工回報 [訂單編號]\n• 查詢任務`,
    "財務": `【財務人員】可用指令：\n• 確認收款 [訂單編號] [金額]\n• 確認付款 [供應商] [金額]\n• 查詢帳務\n• 帳期提醒`,
  };
  return helps[role] || "無可用指令";
}

// 根據角色處理指令
async function handleRoleCommand(role, command, userId) {
  try {
    switch (role) {
      case "管理者":
        return await handleAdminCommand(command);
      case "評估":
        return await handleAssessmentCommand(command);
      case "報價":
        return await handleQuoteCommand(command);
      case "派工":
        return await handleDispatchCommand(command);
      case "施工":
        return await handleConstructionCommand(command);
      case "財務":
        return await handleFinanceCommand(command);
      default:
        return "未知角色，請重新選擇。";
    }
  } catch (error) {
    console.error("處理指令錯誤:", error);
    return `處理指令時發生錯誤：${error.message}`;
  }
}

// ===== 管理者指令 =====
async function handleAdminCommand(command) {
  if (command.startsWith("新增產品")) {
    const parts = command.replace("新增產品", "").trim().split(" ");
    if (parts.length < 3) return "格式：新增產品 [名稱] [售價] [成本]";
    const [name, price, cost] = parts;
    await notion.pages.create({
      parent: { database_id: DATABASE_IDS.product },
      properties: {
        "品項名稱": { title: [{ text: { content: name } }] },
        "標準售價": { number: parseInt(price) },
        "標準成本": { number: parseInt(cost) },
      },
    });
    return `✅ 產品「${name}」已新增！\n售價：${price}\n成本：${cost}`;
  }
  if (command.startsWith("新增供應商")) {
    const parts = command.replace("新增供應商", "").trim().split(" ");
    if (parts.length < 3) return "格式：新增供應商 [名稱] [聯絡人] [電話]";
    const [name, contact, phone] = parts;
    await notion.pages.create({
      parent: { database_id: DATABASE_IDS.supplier },
      properties: {
        "公司名稱": { title: [{ text: { content: name } }] },
        "聯絡人": { rich_text: [{ text: { content: contact } }] },
        "電話": { phone_number: phone },
      },
    });
    return `✅ 供應商「${name}」已新增！\n聯絡人：${contact}\n電話：${phone}`;
  }
  if (command === "查詢產品") {
    const response = await notion.databases.query({ database_id: DATABASE_IDS.product, page_size: 10 });
    if (response.results.length === 0) return "目前沒有產品資料。";
    let result = "📦 產品列表：\n";
    response.results.forEach((page, i) => {
      const name = page.properties["品項名稱"]?.title?.[0]?.text?.content || "未命名";
      const price = page.properties["標準售價"]?.number || 0;
      result += `${i + 1}. ${name} - $${price}\n`;
    });
    return result;
  }
  if (command === "查詢供應商") {
    const response = await notion.databases.query({ database_id: DATABASE_IDS.supplier, page_size: 10 });
    if (response.results.length === 0) return "目前沒有供應商資料。";
    let result = "🏢 供應商列表：\n";
    response.results.forEach((page, i) => {
      const name = page.properties["公司名稱"]?.title?.[0]?.text?.content || "未命名";
      result += `${i + 1}. ${name}\n`;
    });
    return result;
  }
  return getRoleHelp("管理者");
}

// ===== 評估人員指令 =====
async function handleAssessmentCommand(command) {
  if (command.startsWith("新增客戶")) {
    const parts = command.replace("新增客戶", "").trim().split(" ");
    if (parts.length < 3) return "格式：新增客戶 [姓名] [電話] [地址]";
    const [name, phone, ...addressParts] = parts;
    const address = addressParts.join(" ");
    await notion.pages.create({
      parent: { database_id: DATABASE_IDS.customer },
      properties: {
        "姓名": { title: [{ text: { content: name } }] },
        "電話": { phone_number: phone },
        "地址": { rich_text: [{ text: { content: address } }] },
      },
    });
    return `✅ 客戶「${name}」已新增！\n電話：${phone}\n地址：${address}`;
  }
  if (command.startsWith("新增案件")) {
    const parts = command.replace("新增案件", "").trim().split(" ");
    if (parts.length < 2) return "格式：新增案件 [案件編號] [風險區域]";
    const [caseId, ...areaParts] = parts;
    const area = areaParts.join(" ");
    await notion.pages.create({
      parent: { database_id: DATABASE_IDS.case },
      properties: {
        "案件編號": { title: [{ text: { content: caseId } }] },
        "風險區域": { multi_select: area.split(",").map(a => ({ name: a.trim() })) },
        "狀態": { select: { name: "新案件" } },
      },
    });
    return `✅ 案件「${caseId}」已新增！\n風險區域：${area}\n狀態：新案件`;
  }
  if (command === "查詢客戶") {
    const response = await notion.databases.query({ database_id: DATABASE_IDS.customer, page_size: 10 });
    if (response.results.length === 0) return "目前沒有客戶資料。";
    let result = "👥 客戶列表：\n";
    response.results.forEach((page, i) => {
      const name = page.properties["姓名"]?.title?.[0]?.text?.content || "未命名";
      result += `${i + 1}. ${name}\n`;
    });
    return result;
  }
  if (command === "查詢案件") {
    const response = await notion.databases.query({ database_id: DATABASE_IDS.case, page_size: 10 });
    if (response.results.length === 0) return "目前沒有案件資料。";
    let result = "📋 案件列表：\n";
    response.results.forEach((page, i) => {
      const id = page.properties["案件編號"]?.title?.[0]?.text?.content || "未命名";
      const status = page.properties["狀態"]?.select?.name || "未知";
      result += `${i + 1}. ${id} [${status}]\n`;
    });
    return result;
  }
  return getRoleHelp("評估");
}

// ===== 報價/業務指令 =====
async function handleQuoteCommand(command) {
  if (command.startsWith("新增報價")) {
    const parts = command.replace("新增報價", "").trim().split(" ");
    if (parts.length < 2) return "格式：新增報價 [報價編號] [總金額]";
    const [quoteId, amount] = parts;
    await notion.pages.create({
      parent: { database_id: DATABASE_IDS.quote },
      properties: {
        "報價編號": { title: [{ text: { content: quoteId } }] },
        "總金額": { number: parseInt(amount) },
        "確認狀態": { select: { name: "草稿" } },
      },
    });
    return `✅ 報價「${quoteId}」已新增！\n金額：$${amount}\n狀態：草稿`;
  }
  if (command === "查詢報價") {
    const response = await notion.databases.query({ database_id: DATABASE_IDS.quote, page_size: 10 });
    if (response.results.length === 0) return "目前沒有報價資料。";
    let result = "💰 報價列表：\n";
    response.results.forEach((page, i) => {
      const id = page.properties["報價編號"]?.title?.[0]?.text?.content || "未命名";
      const status = page.properties["確認狀態"]?.select?.name || "未知";
      const amount = page.properties["總金額"]?.number || 0;
      result += `${i + 1}. ${id} - $${amount} [${status}]\n`;
    });
    return result;
  }
  return getRoleHelp("報價");
}

// ===== 派工人員指令 =====
async function handleDispatchCommand(command) {
  if (command.startsWith("新增派工")) {
    const parts = command.replace("新增派工", "").trim().split(" ");
    if (parts.length < 2) return "格式：新增派工 [訂單編號] [施作日期]";
    const [orderId, date] = parts;
    await notion.pages.create({
      parent: { database_id: DATABASE_IDS.order },
      properties: {
        "訂單編號": { title: [{ text: { content: orderId } }] },
        "施作日期": { date: { start: date || new Date().toISOString().split("T")[0] } },
        "狀態": { select: { name: "待派工" } },
      },
    });
    return `✅ 派工單「${orderId}」已新增！\n施作日期：${date}\n狀態：待派工`;
  }
  if (command === "查詢派工") {
    const response = await notion.databases.query({ database_id: DATABASE_IDS.order, page_size: 10 });
    if (response.results.length === 0) return "目前沒有派工資料。";
    let result = "🔧 派工列表：\n";
    response.results.forEach((page, i) => {
      const id = page.properties["訂單編號"]?.title?.[0]?.text?.content || "未命名";
      const status = page.properties["狀態"]?.select?.name || "未知";
      result += `${i + 1}. ${id} [${status}]\n`;
    });
    return result;
  }
  if (command.startsWith("更新狀態")) {
    const parts = command.replace("更新狀態", "").trim().split(" ");
    if (parts.length < 2) return "格式：更新狀態 [訂單編號] [新狀態]\n可用狀態：待派工、待下單、施工中、待驗收、待收款、已結案";
    const [orderId, newStatus] = parts;
    const response = await notion.databases.query({
      database_id: DATABASE_IDS.order,
      filter: { property: "訂單編號", title: { equals: orderId } },
    });
    if (response.results.length === 0) return `找不到訂單「${orderId}」`;
    await notion.pages.update({
      page_id: response.results[0].id,
      properties: { "狀態": { select: { name: newStatus } } },
    });
    return `✅ 訂單「${orderId}」狀態已更新為：${newStatus}`;
  }
  return getRoleHelp("派工");
}

// ===== 施工/供應商指令 =====
async function handleConstructionCommand(command) {
  if (command.startsWith("回報進度")) {
    const parts = command.replace("回報進度", "").trim().split(" ");
    if (parts.length < 2) return "格式：回報進度 [訂單編號] [進度說明]";
    const [orderId, ...descParts] = parts;
    const desc = descParts.join(" ");
    const response = await notion.databases.query({
      database_id: DATABASE_IDS.order,
      filter: { property: "訂單編號", title: { equals: orderId } },
    });
    if (response.results.length === 0) return `找不到訂單「${orderId}」`;
    await notion.pages.update({
      page_id: response.results[0].id,
      properties: {
        "材料需求": { rich_text: [{ text: { content: `[${new Date().toLocaleDateString()}] ${desc}` } }] },
        "狀態": { select: { name: "施工中" } },
      },
    });
    return `✅ 訂單「${orderId}」進度已更新：${desc}`;
  }
  if (command.startsWith("完工回報")) {
    const orderId = command.replace("完工回報", "").trim();
    if (!orderId) return "格式：完工回報 [訂單編號]";
    const response = await notion.databases.query({
      database_id: DATABASE_IDS.order,
      filter: { property: "訂單編號", title: { equals: orderId } },
    });
    if (response.results.length === 0) return `找不到訂單「${orderId}」`;
    await notion.pages.update({
      page_id: response.results[0].id,
      properties: { "狀態": { select: { name: "待驗收" } } },
    });
    return `✅ 訂單「${orderId}」已標記為完工，等待驗收。`;
  }
  if (command === "查詢任務") {
    const response = await notion.databases.query({
      database_id: DATABASE_IDS.order,
      filter: { property: "狀態", select: { equals: "施工中" } },
      page_size: 10,
    });
    if (response.results.length === 0) return "目前沒有進行中的施工任務。";
    let result = "🏗️ 施工中任務：\n";
    response.results.forEach((page, i) => {
      const id = page.properties["訂單編號"]?.title?.[0]?.text?.content || "未命名";
      result += `${i + 1}. ${id}\n`;
    });
    return result;
  }
  return getRoleHelp("施工");
}

// ===== 財務人員指令 =====
async function handleFinanceCommand(command) {
  if (command.startsWith("確認收款")) {
    const parts = command.replace("確認收款", "").trim().split(" ");
    if (parts.length < 2) return "格式：確認收款 [訂單編號] [金額]";
    const [orderId, amount] = parts;
    const response = await notion.databases.query({
      database_id: DATABASE_IDS.order,
      filter: { property: "訂單編號", title: { equals: orderId } },
    });
    if (response.results.length === 0) return `找不到訂單「${orderId}」`;
    await notion.pages.update({
      page_id: response.results[0].id,
      properties: { "狀態": { select: { name: "已結案" } } },
    });
    return `✅ 訂單「${orderId}」已確認收款 $${amount}，狀態更新為已結案。`;
  }
  if (command === "查詢帳務") {
    const response = await notion.databases.query({
      database_id: DATABASE_IDS.order,
      filter: { property: "狀態", select: { equals: "待收款" } },
      page_size: 10,
    });
    if (response.results.length === 0) return "目前沒有待收款的訂單。";
    let result = "💳 待收款訂單：\n";
    response.results.forEach((page, i) => {
      const id = page.properties["訂單編號"]?.title?.[0]?.text?.content || "未命名";
      result += `${i + 1}. ${id}\n`;
    });
    return result;
  }
  if (command === "帳期提醒") {
    const response = await notion.databases.query({
      database_id: DATABASE_IDS.supplier,
      page_size: 10,
    });
    if (response.results.length === 0) return "目前沒有供應商資料。";
    let result = "⏰ 供應商帳期資訊：\n";
    response.results.forEach((page, i) => {
      const name = page.properties["公司名稱"]?.title?.[0]?.text?.content || "未命名";
      const term = page.properties["帳期"]?.select?.name || "未設定";
      result += `${i + 1}. ${name} - 帳期：${term}\n`;
    });
    return result;
  }
  return getRoleHelp("財務");
}

// 啟動伺服器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`LINE Bot server running on port ${PORT}`);
});
