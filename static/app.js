// =====================================================================
// 비품 신청·재고 관리 앱 - 화면 동작
//
// [지금 단계(step-0)의 특징]
// - 신청 데이터는 아래 requests 변수(브라우저 메모리)에만 저장됩니다.
// - 그래서 새로고침하면 등록·변경·삭제한 내용이 모두 사라지고
//   처음의 가짜 데이터 25건으로 돌아갑니다.
// =====================================================================

// 상태는 이 세 가지만 사용합니다. (순서: 접수 → 승인 → 지급 완료)
const STATUSES = ["접수", "승인", "지급 완료"];

// 미리 넣어 둔 가짜 데이터 25건 (실제 사람·부서가 아닌 연습용 데이터)
let requests = [
  { id: 1,  requester: "신청자 A", item: "A4 용지",       quantity: 10, category: "사무용품",   department: "가상팀1", reason: "월간 보고서 출력용",     status: "지급 완료", createdAt: "2026-10-01" },
  { id: 2,  requester: "신청자 B", item: "볼펜",          quantity: 20, category: "사무용품",   department: "가상팀2", reason: "팀 공용 필기구 보충",    status: "지급 완료", createdAt: "2026-10-02" },
  { id: 3,  requester: "신청자 C", item: "모니터 받침대", quantity: 2,  category: "전산소모품", department: "가상팀3", reason: "신규 자리 배치",         status: "지급 완료", createdAt: "2026-10-04" },
  { id: 4,  requester: "신청자 D", item: "토너",          quantity: 3,  category: "전산소모품", department: "가상팀1", reason: "복합기 토너 소진",       status: "지급 완료", createdAt: "2026-10-06" },
  { id: 5,  requester: "신청자 E", item: "마우스",        quantity: 1,  category: "전산소모품", department: "가상팀4", reason: "기존 마우스 고장",       status: "지급 완료", createdAt: "2026-10-07" },
  { id: 6,  requester: "신청자 F", item: "포스트잇",      quantity: 15, category: "사무용품",   department: "가상팀2", reason: "회의 자료 정리용",       status: "지급 완료", createdAt: "2026-10-09" },
  { id: 7,  requester: "신청자 G", item: "종이컵",        quantity: 5,  category: "생활용품",   department: "가상팀5", reason: "탕비실 비치용",          status: "지급 완료", createdAt: "2026-10-10" },
  { id: 8,  requester: "신청자 H", item: "클립",          quantity: 10, category: "사무용품",   department: "가상팀3", reason: "서류 정리용",            status: "승인",      createdAt: "2026-10-13" },
  { id: 9,  requester: "신청자 I", item: "키보드",        quantity: 1,  category: "전산소모품", department: "가상팀4", reason: "자판 일부 입력 불량",    status: "지급 완료", createdAt: "2026-10-14" },
  { id: 10, requester: "신청자 J", item: "물티슈",        quantity: 6,  category: "생활용품",   department: "가상팀1", reason: "회의실 비치용",          status: "승인",      createdAt: "2026-10-15" },
  { id: 11, requester: "신청자 K", item: "형광펜",        quantity: 12, category: "사무용품",   department: "가상팀5", reason: "교육 자료 표시용",       status: "지급 완료", createdAt: "2026-10-16" },
  { id: 12, requester: "신청자 L", item: "USB 메모리",    quantity: 2,  category: "전산소모품", department: "가상팀2", reason: "자료 전달용",            status: "승인",      createdAt: "2026-10-17" },
  { id: 13, requester: "신청자 M", item: "화이트보드 마커", quantity: 8, category: "사무용품",  department: "가상팀3", reason: "회의실 마커 교체",       status: "승인",      createdAt: "2026-10-20" },
  { id: 14, requester: "신청자 N", item: "핸드타월",      quantity: 4,  category: "생활용품",   department: "가상팀4", reason: "화장실 비치용",          status: "지급 완료", createdAt: "2026-10-21" },
  { id: 15, requester: "신청자 O", item: "스테이플러",    quantity: 2,  category: "사무용품",   department: "가상팀1", reason: "팀 공용 비품",           status: "승인",      createdAt: "2026-10-22" },
  { id: 16, requester: "신청자 P", item: "HDMI 케이블",   quantity: 3,  category: "전산소모품", department: "가상팀5", reason: "회의실 발표 연결용",     status: "접수",      createdAt: "2026-10-23" },
  { id: 17, requester: "신청자 Q", item: "커피 믹스",     quantity: 3,  category: "생활용품",   department: "가상팀2", reason: "탕비실 비치용",          status: "승인",      createdAt: "2026-10-24" },
  { id: 18, requester: "신청자 R", item: "파일 바인더",   quantity: 10, category: "사무용품",   department: "가상팀3", reason: "계약 서류 보관용",       status: "접수",      createdAt: "2026-10-27" },
  { id: 19, requester: "신청자 S", item: "배터리(AA)",    quantity: 20, category: "기타",       department: "가상팀4", reason: "무선 마우스·리모컨용",   status: "접수",      createdAt: "2026-10-28" },
  { id: 20, requester: "신청자 T", item: "A4 용지",       quantity: 5,  category: "사무용품",   department: "가상팀5", reason: "교육 자료 출력용",       status: "승인",      createdAt: "2026-10-29" },
  { id: 21, requester: "신청자 U", item: "멀티탭",        quantity: 2,  category: "기타",       department: "가상팀1", reason: "회의실 전원 부족",       status: "접수",      createdAt: "2026-10-30" },
  { id: 22, requester: "신청자 V", item: "종이컵",        quantity: 10, category: "생활용품",   department: "가상팀2", reason: "행사 준비용",            status: "접수",      createdAt: "2026-11-02" },
  { id: 23, requester: "신청자 W", item: "토너",          quantity: 2,  category: "전산소모품", department: "가상팀3", reason: "프린터 출력 흐림",       status: "접수",      createdAt: "2026-11-03" },
  { id: 24, requester: "신청자 X", item: "볼펜",          quantity: 30, category: "사무용품",   department: "가상팀4", reason: "신규 입사자 지급용",     status: "접수",      createdAt: "2026-11-04" },
  { id: 25, requester: "신청자 Y", item: "마우스",        quantity: 2,  category: "전산소모품", department: "가상팀5", reason: "예비용",                 status: "접수",      createdAt: "2026-11-05" },
];

// 다음에 등록할 신청의 번호
let nextId = 26;


// ---------------------------------------------------------------------
// 데이터 다루기: 등록 / 상태 변경 / 삭제
// ---------------------------------------------------------------------

// 새 신청 등록
function addRequest(data) {
  requests.push({
    id: nextId,
    requester: data.requester,
    item: data.item,
    quantity: data.quantity,
    category: data.category,
    department: data.department,
    reason: data.reason,
    status: "접수",                // 새 신청은 항상 "접수" 상태로 시작
    createdAt: today(),
  });
  nextId = nextId + 1;
  render();
}

// 상태 변경
function changeStatus(id, newStatus) {
  const target = requests.find((r) => r.id === id);
  if (target) {
    target.status = newStatus;
  }
  render();
}

// 신청 삭제
function deleteRequest(id) {
  requests = requests.filter((r) => r.id !== id);
  render();
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

document.getElementById("request-form").addEventListener("submit", (e) => {
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

  addRequest({
    requester: form.requester.value.trim(),
    item: form.item.value.trim(),
    quantity: quantity,
    category: form.category.value,
    department: form.department.value.trim(),
    reason: form.reason.value.trim(),
  });

  form.reset();
});

render();
