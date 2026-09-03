"use strict";

const el = (id) => document.getElementById(id);

const views = {
  email: el("view-email"),
  otp: el("view-otp"),
  dashboard: el("view-dashboard"),
};

let pendingEmail = "";

function showView(name) {
  for (const [key, node] of Object.entries(views)) {
    node.classList.toggle("hidden", key !== name);
  }
}

function showBanner(message, type = "info") {
  const banner = el("banner");
  banner.textContent = message;
  banner.className = `banner ${type}`;
  banner.classList.remove("hidden");
}

function clearBanner() {
  el("banner").classList.add("hidden");
}

// [개발/테스트 전용] Admin API 키는 이 입력창의 값을 매 요청 헤더로만 전달하고,
// 브라우저 저장소(localStorage/sessionStorage)나 서버에는 어디에도 저장하지 않는다.
function getAdminApiKey() {
  return el("input-admin-key").value.trim();
}

async function api(path, options = {}) {
  const headers = { "content-type": "application/json" };
  const adminKey = getAdminApiKey();
  if (adminKey) headers["x-admin-api-key"] = adminKey;

  const res = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const contentType = res.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json") ? await res.json() : null;
  if (!res.ok) {
    const message = data?.error ?? `요청이 실패했습니다 (${res.status})`;
    // [개발/테스트 전용] 서버가 내려주는 실제 원인(detail)을 함께 보여준다.
    throw new Error(data?.detail ? `${message} — ${data.detail}` : message);
  }
  return data;
}

function setUserInfo(user) {
  el("user-info").classList.toggle("hidden", !user);
  el("user-email").textContent = user ? `${user.name ?? user.email} (${user.email})` : "";
}

async function init() {
  try {
    const { user } = await api("/api/auth/me");
    setUserInfo(user);
    showView("dashboard");
    await loadMembers();
  } catch {
    setUserInfo(null);
    showView("email");
  }
}

// [개발/테스트 전용] 서버가 이메일 발송 대신 응답에 담아 보내주는 인증코드를 화면에 그대로 노출한다.
function showDevCode(devCode) {
  const box = el("dev-code-box");
  if (devCode) {
    box.textContent = `[개발/테스트용] 인증코드: ${devCode}`;
    box.classList.remove("hidden");
  } else {
    box.classList.add("hidden");
    box.textContent = "";
  }
}

el("form-email").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearBanner();
  const email = el("input-email").value.trim();
  try {
    const { message, devCode } = await api("/api/auth/request-code", { method: "POST", body: { email } });
    pendingEmail = email;
    el("otp-email").textContent = email;
    showBanner(message, "success");
    showDevCode(devCode);
    showView("otp");
  } catch (err) {
    showBanner(err.message, "error");
  }
});

el("form-otp").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearBanner();
  const code = el("input-code").value.trim();
  try {
    const { user } = await api("/api/auth/verify-code", {
      method: "POST",
      body: { email: pendingEmail, code },
    });
    setUserInfo(user);
    showView("dashboard");
    el("input-code").value = "";
    await loadMembers();
  } catch (err) {
    showBanner(err.message, "error");
  }
});

el("btn-resend").addEventListener("click", async () => {
  clearBanner();
  try {
    const { message, devCode } = await api("/api/auth/request-code", {
      method: "POST",
      body: { email: pendingEmail },
    });
    showBanner(message, "success");
    showDevCode(devCode);
  } catch (err) {
    showBanner(err.message, "error");
  }
});

el("btn-back-email").addEventListener("click", () => {
  clearBanner();
  showDevCode(null);
  showView("email");
});

el("logout-btn").addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" });
  setUserInfo(null);
  showView("email");
});

el("btn-refresh").addEventListener("click", () => loadMembers());

function formatAmount(minorUnitsStr, currency) {
  if (minorUnitsStr === null || minorUnitsStr === undefined) return "무제한";
  const value = Number.parseFloat(minorUnitsStr) / 100;
  return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function sourceLabel(member) {
  switch (member.sourceType) {
    case "user":
      return "개인별 설정";
    case "seat_tier":
      return "등급 기본값";
    case "rbac_group":
      return `그룹: ${member.sourceGroupName ?? "알수없음"}`;
    case "organization":
      return "조직 기본값";
    default:
      return "알수없음";
  }
}

function buildRow(member) {
  const tr = document.createElement("tr");

  const cells = [
    member.name ?? "-",
    member.email,
    member.groupNames.length ? member.groupNames.join(", ") : "-",
  ];
  for (const text of cells) {
    const td = document.createElement("td");
    td.textContent = text;
    tr.appendChild(td);
  }

  const groupBaselineTd = document.createElement("td");
  groupBaselineTd.textContent = member.groupBaselineKnown
    ? formatAmount(member.groupBaselineAmount, member.currency)
    : "확인 불가";
  tr.appendChild(groupBaselineTd);

  const sourceTd = document.createElement("td");
  const tag = document.createElement("span");
  tag.className = `tag ${member.sourceType === "user" ? "user-override" : ""}`;
  tag.textContent = `${formatAmount(member.effectiveAmount, member.currency)} · ${sourceLabel(member)}`;
  sourceTd.appendChild(tag);
  tr.appendChild(sourceTd);

  const spendTd = document.createElement("td");
  spendTd.textContent = formatAmount(member.periodToDateSpend, member.currency);
  tr.appendChild(spendTd);

  const actionTd = document.createElement("td");
  const wrap = document.createElement("div");
  wrap.className = "limit-cell";

  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.step = "0.01";
  input.placeholder = "예: 500.00";
  if (member.hasIndividualOverride && member.effectiveAmount !== null) {
    input.value = (Number.parseFloat(member.effectiveAmount) / 100).toFixed(2);
  }

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn btn-secondary btn-small";
  saveBtn.textContent = "저장";
  saveBtn.addEventListener("click", async () => {
    const amount = Number.parseFloat(input.value);
    if (!Number.isFinite(amount) || amount < 0) {
      showBanner("올바른 금액을 입력해주세요.", "error");
      return;
    }
    try {
      await api(`/api/members/${encodeURIComponent(member.userId)}/limit`, {
        method: "PUT",
        body: { amountMajorUnits: amount },
      });
      showBanner(`${member.email} 님의 개인별 제한을 저장했습니다.`, "success");
      await loadMembers();
    } catch (err) {
      showBanner(err.message, "error");
    }
  });

  wrap.appendChild(input);
  wrap.appendChild(saveBtn);

  if (member.hasIndividualOverride) {
    const removeBtn = document.createElement("button");
    removeBtn.className = "btn btn-ghost btn-small";
    removeBtn.textContent = "해제";
    removeBtn.addEventListener("click", async () => {
      try {
        await api(`/api/members/${encodeURIComponent(member.userId)}/limit`, {
          method: "DELETE",
          body: { spendLimitId: member.spendLimitId },
        });
        showBanner(`${member.email} 님의 개인별 제한을 해제했습니다.`, "success");
        await loadMembers();
      } catch (err) {
        showBanner(err.message, "error");
      }
    });
    wrap.appendChild(removeBtn);
  }

  actionTd.appendChild(wrap);
  tr.appendChild(actionTd);

  return tr;
}

async function loadMembers() {
  try {
    const { members, groupsWarning } = await api("/api/members");
    const tbody = el("members-tbody");
    tbody.replaceChildren(...members.map(buildRow));
    if (groupsWarning) {
      // 그룹 정보만 못 가져온 경우: 나머지(이름/이메일/개인별 제한)는 정상 표시하고 경고만 알린다.
      showBanner(`그룹 정보를 불러오지 못했습니다 — ${groupsWarning}`, "error");
    } else {
      clearBanner();
    }
  } catch (err) {
    showBanner(err.message, "error");
  }
}

init();
