const crypto = require("crypto");

// 模擬環境變數
const CHANNEL_SECRET = "60e5f3a61d0018d849cc3d0ab545b236";

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

// 測試情境 1: LINE Verify 測試（空 events）
console.log("=== 測試情境 1: LINE Verify 測試（空 events） ===");
const verifyBody = JSON.stringify({ events: [] });
const verifySignature = crypto
  .createHmac("sha256", CHANNEL_SECRET)
  .update(verifyBody, "utf8")
  .digest("base64");

console.log("模擬 LINE Developers Console Verify 請求:");
console.log("- Body:", verifyBody);
console.log("- Signature:", verifySignature);
console.log("- 簽章驗證:", verifyLineSignature(verifyBody, verifySignature) ? "✅ 通過" : "❌ 失敗");
console.log("- 預期回應: 200 OK { message: 'OK' }");

// 測試情境 2: 實際訊息事件
console.log("\n=== 測試情境 2: 實際訊息事件 ===");
const messageBody = JSON.stringify({
  events: [
    {
      type: "message",
      message: { type: "text", text: "管理者" },
      replyToken: "nHuyWiB7yP5Zw52FIkcQT",
      source: { userId: "U1234567890" },
      timestamp: 1462629479859
    }
  ]
});
const messageSignature = crypto
  .createHmac("sha256", CHANNEL_SECRET)
  .update(messageBody, "utf8")
  .digest("base64");

console.log("模擬用戶訊息請求:");
console.log("- Body:", messageBody);
console.log("- Signature:", messageSignature);
console.log("- 簽章驗證:", verifyLineSignature(messageBody, messageSignature) ? "✅ 通過" : "❌ 失敗");
console.log("- 預期回應: 200 OK (事件已處理)");

// 測試情境 3: 無效簽章
console.log("\n=== 測試情境 3: 無效簽章 ===");
const invalidSignature = "invalid-signature";
console.log("模擬無效簽章請求:");
console.log("- Body:", verifyBody);
console.log("- Signature:", invalidSignature);
console.log("- 簽章驗證:", verifyLineSignature(verifyBody, invalidSignature) ? "❌ 不應該通過" : "✅ 正確拒絕");
console.log("- 預期回應: 401 Unauthorized");

// 測試情境 4: 缺失簽章
console.log("\n=== 測試情境 4: 缺失簽章 ===");
console.log("模擬缺失簽章請求:");
console.log("- Body:", verifyBody);
console.log("- Signature: (缺失)");
console.log("- 簽章驗證:", verifyLineSignature(verifyBody, undefined) ? "✅ 開發模式允許通過" : "❌ 拒絕");
console.log("- 預期回應: 200 OK (開發模式)");

console.log("\n✅ 所有整合測試完成");
