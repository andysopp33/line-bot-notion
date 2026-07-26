const crypto = require("crypto");

// 模擬 LINE Channel Secret
const CHANNEL_SECRET = "60e5f3a61d0018d849cc3d0ab545b236";

/**
 * 驗證 LINE 簽章
 */
function verifyLineSignature(body, signature) {
  if (!CHANNEL_SECRET || !signature) {
    console.warn("Channel Secret 或 Signature 缺失，跳過驗證");
    return true;
  }

  const hash = crypto
    .createHmac("sha256", CHANNEL_SECRET)
    .update(body, "utf8")
    .digest("base64");

  return hash === signature;
}

// 測試 1: 驗證空 events 陣列的簽章
console.log("=== 測試 1: 空 events 陣列 ===");
const emptyEventsBody = JSON.stringify({ events: [] });
const emptyEventsSignature = crypto
  .createHmac("sha256", CHANNEL_SECRET)
  .update(emptyEventsBody, "utf8")
  .digest("base64");

console.log("Body:", emptyEventsBody);
console.log("Signature:", emptyEventsSignature);
console.log("驗證結果:", verifyLineSignature(emptyEventsBody, emptyEventsSignature) ? "✅ 通過" : "❌ 失敗");

// 測試 2: 驗證包含事件的簽章
console.log("\n=== 測試 2: 包含訊息事件的簽章 ===");
const messageEventBody = JSON.stringify({
  events: [
    {
      type: "message",
      message: { type: "text", text: "測試訊息" },
      replyToken: "test-token",
      source: { userId: "U1234567890" }
    }
  ]
});
const messageEventSignature = crypto
  .createHmac("sha256", CHANNEL_SECRET)
  .update(messageEventBody, "utf8")
  .digest("base64");

console.log("Body:", messageEventBody);
console.log("Signature:", messageEventSignature);
console.log("驗證結果:", verifyLineSignature(messageEventBody, messageEventSignature) ? "✅ 通過" : "❌ 失敗");

// 測試 3: 驗證錯誤的簽章
console.log("\n=== 測試 3: 錯誤的簽章 ===");
const wrongSignature = "wrongSignature";
console.log("Signature:", wrongSignature);
console.log("驗證結果:", verifyLineSignature(emptyEventsBody, wrongSignature) ? "❌ 不應該通過" : "✅ 正確拒絕");

console.log("\n✅ 所有簽章驗證測試完成");
