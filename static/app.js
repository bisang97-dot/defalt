const STATUSES = ["접수", "승인", "지급 완료"];

const form = document.getElementById("request-form");
const list = document.getElementById("request-list");
const empty = document.getElementById("empty");
const message = document.getElementById("message");

function showMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "요청을 처리하지 못했습니다.");
  return data;
}

function cell(text) {
  const td = document.createElement("td");
  td.textContent = text;
  return td;
}

function render(requests) {
  list.replaceChildren();
  empty.hidden = requests.length > 0;
  for (const r of requests) {
    const tr = document.createElement("tr");
    tr.append(cell(r.id), cell(r.created_at), cell(r.requester), cell(r.item), cell(r.quantity), cell(r.reason));

    const statusTd = document.createElement("td");
    const select = document.createElement("select");
    for (const s of STATUSES) {
      const opt = new Option(s, s, false, s === r.status);
      select.append(opt);
    }
    select.addEventListener("change", async () => {
      try {
        await api("PATCH", `/api/requests/${r.id}`, { status: select.value });
        showMessage(`${r.id}번 신청 상태를 '${select.value}'(으)로 바꿨습니다.`);
      } catch (e) {
        showMessage(e.message, true);
      }
      load();
    });
    statusTd.append(select);

    const deleteTd = document.createElement("td");
    const btn = document.createElement("button");
    btn.className = "delete";
    btn.textContent = "삭제";
    btn.addEventListener("click", async () => {
      if (!confirm(`${r.id}번 신청을 삭제할까요?`)) return;
      try {
        await api("DELETE", `/api/requests/${r.id}`);
        showMessage(`${r.id}번 신청을 삭제했습니다.`);
      } catch (e) {
        showMessage(e.message, true);
      }
      load();
    });
    deleteTd.append(btn);

    tr.append(statusTd, deleteTd);
    list.append(tr);
  }
}

async function load() {
  try {
    render(await api("GET", "/api/requests"));
  } catch (e) {
    showMessage(e.message, true);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const fd = new FormData(form);
  try {
    const created = await api("POST", "/api/requests", {
      requester: fd.get("requester"),
      item: fd.get("item"),
      quantity: Number(fd.get("quantity")),
      reason: fd.get("reason"),
    });
    showMessage(`${created.id}번 신청을 등록했습니다.`);
    form.reset();
    load();
  } catch (e) {
    showMessage(e.message, true);
  }
});

load();
