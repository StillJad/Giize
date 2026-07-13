"use client";

export function EventActionButtons({ ended }: { ended: boolean }) {
  return (
    <>
      {!ended ? (
        <button
          name="action"
          value="end"
          className="secondary"
          onClick={event => {
            if (!confirm("End this event and disable applications/buttons?")) event.preventDefault();
          }}
        >
          End
        </button>
      ) : null}{" "}
      <button
        name="action"
        value="delete"
        className="danger"
        onClick={event => {
          if (!confirm("Delete this event and its related records?")) event.preventDefault();
        }}
      >
        Delete
      </button>
    </>
  );
}
