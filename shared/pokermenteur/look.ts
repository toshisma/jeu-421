/**
 * Apparence des dés de poker (partagée : le rendu 3D et le test de lisibilité, contraste ≥ 4).
 * Face ivoire, figures en rouge, 9 / 10 / As en encre noire bleutée.
 */
export const PM_DIE_BODY = '#f6efdf';
export const PM_DIE_EDGE = '#e4d8bd';
/** Couleur du signe de chaque face (0 = 9 … 5 = As). */
export const PM_FACE_INK = ['#15203a', '#15203a', '#a3161c', '#a3161c', '#a3161c', '#15203a'] as const;
