export const materialLabels = ['crt', 'lcd_panel', 'pcb', 'cable', 'battery', 'motor', 'magnet_assembly', 'mixed_plastic', 'other'] as const;
export type MaterialLabel = typeof materialLabels[number];
export type Prediction = { material: MaterialLabel; confidence: number };

/**
 * The model is bundled only in a development build. This adapter deliberately
 * returns no prediction until its native image-to-tensor preprocessor is wired;
 * manual category selection remains the safe supported path.
 */
export async function classifyLocally(_uri: string): Promise<Prediction | null> {
  return null;
}
