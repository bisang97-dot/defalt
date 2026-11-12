// =====================================================================
// 비품 신청·재고 관리 앱 - 화면 동작
//
// [지금 단계의 특징]
// - 신청 데이터는 서버(app.py)의 데이터베이스(supplies.db)에 저장됩니다.
// - 화면은 서버에서 목록을 받아 와 보여 주고,
//   등록·상태 변경·삭제를 하면 서버에 알린 뒤 목록을 다시 받아 옵니다.
// - 그래서 새로고침하거나 서버를 껐다 켜도 내용이 그대로 남습니다.
// =====================================================================

// 상태는 이 세 가지만 사용합니다. (순서: 접수 → 승인 → 지급 완료)
const STATUSES = ["접수", "승인", "지급 완료"];

// 서버에서 받아 온 신청 목록 (화면에 그릴 때 사용)
let requests = [];


// ---------------------------------------------------------------------
// 서버와 주고받기
// ---------------------------------------------------------------------

// 서버에 요청을 보내고 결과(JSON)를 돌려받습니다. 실패하면 오류를 냅니다.
async function callServer(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method: method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error("서버에 연결할 수 없습니다. 서버(python app.py)가 켜져 있는지 확인해 주세요.");
  }
  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(result.error || "요청을 처리하지 못했습니다.");
  }
  return result;
}

// 서버에서 최신 목록을 받아 와 화면을 다시 그립니다.
async function loadRequests() {
  try {
    requests = await callServer("GET", "/api/requests");
  } catch (err) {
    alert(err.message);
  }
  render();
}


// ---------------------------------------------------------------------
// 데이터 다루기: 등록 / 상태 변경 / 삭제
// (서버에 저장한 뒤 목록을 다시 받아 옵니다)
// ---------------------------------------------------------------------

// 새 신청 등록 (성공하면 true)
async function addRequest(data) {
  try {
    await callServer("POST", "/api/requests", data);   // 새 신청은 서버에서 "접수" 상태로 저장
  } catch (err) {
    alert(err.message);
    return false;
  }
  await loadRequests();
  return true;
}

// 상태 변경
async function changeStatus(id, newStatus) {
  try {
    await callServer("PATCH", `/api/requests/${id}`, { status: newStatus });
  } catch (err) {
    alert(err.message);
    render();                        // 실패하면 원래 상태로 다시 그리기
    return;
  }
  await loadRequests();
}

// 신청 삭제
async function deleteRequest(id) {
  try {
    await callServer("DELETE", `/api/requests/${id}`);
  } catch (err) {
    alert(err.message);
    return;
  }
  await loadRequests();
}


// ---------------------------------------------------------------------
// 화면 그리기
// ---------------------------------------------------------------------

// 신청 목록 표를 다시 그립니다. (최신순: 번호가 큰 것이 위로)
function render() {
  const tbody = document.getElementById("request-rows");
  tbody.innerHTML = "";

  const sorted = [...requests].sort((a, b) => b.id - a.id);

  if (sorted.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty">등록된 신청이 없습니다.</td></tr>';
  }

  for (const r of sorted) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(r.requester)}</td>
      <td>${escapeHtml(r.item)}</td>
      <td class="num">${r.quantity}</td>
      <td><span class="badge ${statusClass(r.status)}">${r.status}</span></td>
      <td>${escapeHtml(r.category)}</td>
      <td>${escapeHtml(r.department)}</td>
      <td>${escapeHtml(r.reason)}</td>
      <td>${r.createdAt}</td>
      <td class="actions">
        <select class="status-select" aria-label="상태 변경">
          ${STATUSES.map((s) => `<option value="${s}" ${s === r.status ? "selected" : ""}>${s}</option>`).join("")}
        </select>
        <button type="button" class="btn btn-danger">삭제</button>
      </td>
    `;

    // 상태 선택을 바꾸면 상태 변경
    tr.querySelector(".status-select").addEventListener("change", (e) => {
      changeStatus(r.id, e.target.value);
    });

    // 삭제 버튼을 누르면 확인 후 삭제
    tr.querySelector(".btn-danger").addEventListener("click", () => {
      if (confirm(`${r.requester}의 "${r.item}" 신청을 삭제할까요?`)) {
        deleteRequest(r.id);
      }
    });

    tbody.appendChild(tr);
  }

  renderSummary();
}

// 상태별 건수 표시 (예: 전체 25건 · 접수 8건 · 승인 7건 · 지급 완료 10건)
function renderSummary() {
  const parts = [`전체 ${requests.length}건`];
  for (const s of STATUSES) {
    const count = requests.filter((r) => r.status === s).length;
    parts.push(`${s} ${count}건`);
  }
  document.getElementById("summary").textContent = parts.join(" · ");
}


// ---------------------------------------------------------------------
// 도우미 함수
// ---------------------------------------------------------------------

// 상태 이름 → 배지 모양 이름 (디자인 파일 style.css에서 사용)
function statusClass(status) {
  if (status === "접수") return "status-received";
  if (status === "승인") return "status-approved";
  if (status === "지급 완료") return "status-done";
  return "";
}

// 오늘 날짜를 "2026-11-09" 형식으로
function today() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// 입력값에 들어 있는 특수문자가 화면을 망가뜨리지 않도록 바꿔 줍니다.
function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}


// ---------------------------------------------------------------------
// 등록 폼 연결 & 첫 화면 그리기
// ---------------------------------------------------------------------

document.getElementById("request-form").addEventListener("submit", async (e) => {
  e.preventDefault();               // 페이지가 새로고침되지 않도록 막기
  const form = e.target;
  const quantity = Number(form.quantity.value);

  if (!form.requester.value.trim() || !form.item.value.trim() || !form.department.value.trim()) {
    alert("신청자, 신청 부서, 비품을 입력해 주세요.");
    return;
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    alert("수량은 1 이상의 숫자로 입력해 주세요.");
    return;
  }

  const saved = await addRequest({
    requester: form.requester.value.trim(),
    item: form.item.value.trim(),
    quantity: quantity,
    category: form.category.value,
    department: form.department.value.trim(),
    reason: form.reason.value.trim(),
  });

  if (saved) {
    form.reset();                   // 저장에 성공했을 때만 입력칸을 비웁니다.
  }
});

// 첫 화면: 서버에서 목록을 받아 와 그리기
loadRequests();
