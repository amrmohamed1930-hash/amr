/** Uniform success envelope: { success: true, data, meta? } */
export const ok = (res, data, meta) => res.json({ success: true, data, ...(meta ? { meta } : {}) });

export const created = (res, data) => res.status(201).json({ success: true, data });

export const noContent = (res) => res.status(204).send();
