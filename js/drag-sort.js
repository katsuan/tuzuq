// つづく：⠿ を引っぱって並べ替える（画面の部品）。指でもマウスでも（HTML の D&D は iPhone の指で動かないので pointer で）
// - list の中の [data-row] を並べ替える。つかむところは [data-grip]（値は行の id）
// - 離したら onDrop(id, from, to)。動かなくても呼ぶ（描きなおしのため）
export function dragSort(list, onDrop) {
  let drag = null;
  const rows = () => [...list.querySelectorAll("[data-row]")];
  list.addEventListener("pointerdown", (e) => {
    const grip = e.target.closest("[data-grip]");
    if (!grip || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    const row = grip.closest("[data-row]");
    drag = { id: grip.dataset.grip, row, from: rows().indexOf(row) };
    row.classList.add("is-dragging");
    try {
      grip.setPointerCapture(e.pointerId);
    } catch {
      // つかめなくても、一覧の上での動きで並べ替えられる
    }
  });
  list.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const others = rows().filter((r) => r !== drag.row);
    const next = others.find((r) => {
      const b = r.getBoundingClientRect();
      return e.clientY < b.top + b.height / 2;
    });
    if (next) {
      if (drag.row.nextElementSibling !== next) next.before(drag.row);
    } else if (others.length && others[others.length - 1].nextElementSibling !== drag.row) {
      others[others.length - 1].after(drag.row);
    }
  });
  const end = () => {
    if (!drag) return;
    const { id, from, row } = drag;
    const to = rows().indexOf(row);
    row.classList.remove("is-dragging");
    drag = null;
    onDrop(id, from, to);
  };
  list.addEventListener("pointerup", end);
  list.addEventListener("pointercancel", end);
}
