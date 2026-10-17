/**
 * Mainnet solo en la compilación de mainnet (`pnpm build:mainnet`, VITE_ALLOW_MAINNET=autorizado),
 * autorizada por la responsable del proyecto con tope de USD 20 (docs/mainnet.md). La compilación
 * normal solo abre regalos de redes de prueba.
 */
export const ALLOW_MAINNET: boolean = import.meta.env?.VITE_ALLOW_MAINNET === 'autorizado';
