/**
 * OCR Tools
 *
 * Built-in tools for text recognition using Anode OcrAPI (PP-OCRv3 via EasyEdge SDK)
 * Based on OcrAPI.kt @V8Function annotations
 */
import { z } from 'zod';
import { logger } from '../../utils/logger.js';
/**
 * OCR Recognize Screen Tool
 * Captures the screen and recognizes text
 */
export const ocrRecognizeScreenTool = {
    name: 'ocr_recognize_screen',
    description: 'Capture the current screen and recognize all text on it. Returns the recognized text as a string. Uses PP-OCRv3 engine (supports Chinese, English, Japanese, Korean, etc.).',
    category: 'ocr',
    permissions: ['android:screenshot'],
    parallelizable: false,
    parameters: [
        {
            name: 'confidence',
            description: 'Minimum confidence threshold 0.0-1.0 (default: 0.3)',
            schema: z.number().min(0).max(1),
            required: false,
            default: 0.3,
        },
    ],
    async execute(params) {
        try {
            const { confidence = 0.3 } = params;
            logger.debug(`OCR recognize screen, confidence: ${confidence}`);
            const bitmap = await image.captureScreen();
            if (!bitmap) {
                throw new Error('Failed to capture screen');
            }
            const text = await ocr.recognizeText(bitmap, confidence);
            return {
                success: true,
                output: {
                    text,
                    source: 'screen',
                    confidence,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'OCR_SCREEN_FAILED',
                    message: error instanceof Error ? error.message : 'Screen OCR failed',
                },
            };
        }
    },
};
/**
 * OCR Recognize Screen with Details Tool
 * Returns detailed results with text position and confidence for each detected text block
 */
export const ocrRecognizeScreenDetailsTool = {
    name: 'ocr_recognize_screen_details',
    description: 'Capture the current screen and recognize text with detailed position info. Returns array of {label, confidence, points} for each text block. Useful when you need to know WHERE text is on screen.',
    category: 'ocr',
    permissions: ['android:screenshot'],
    parallelizable: false,
    parameters: [
        {
            name: 'confidence',
            description: 'Minimum confidence threshold 0.0-1.0 (default: 0.3)',
            schema: z.number().min(0).max(1),
            required: false,
            default: 0.3,
        },
    ],
    async execute(params) {
        try {
            const { confidence = 0.3 } = params;
            logger.debug(`OCR recognize screen details, confidence: ${confidence}`);
            const bitmap = await image.captureScreen();
            if (!bitmap) {
                throw new Error('Failed to capture screen');
            }
            const results = await ocr.recognize(bitmap, confidence);
            return {
                success: true,
                output: {
                    results,
                    count: results.length,
                    source: 'screen',
                    confidence,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'OCR_SCREEN_DETAILS_FAILED',
                    message: error instanceof Error ? error.message : 'Screen OCR detail recognition failed',
                },
            };
        }
    },
};
/**
 * OCR Recognize File Tool
 * Recognizes text from an image file path
 */
export const ocrRecognizeFileTool = {
    name: 'ocr_recognize_file',
    description: 'Recognize text from an image file. Returns array of {label, confidence, points} for each text block.',
    category: 'ocr',
    permissions: ['file:read'],
    parallelizable: true,
    parameters: [
        {
            name: 'path',
            description: 'Absolute path to the image file',
            schema: z.string(),
            required: true,
        },
        {
            name: 'confidence',
            description: 'Minimum confidence threshold 0.0-1.0 (default: 0.3)',
            schema: z.number().min(0).max(1),
            required: false,
            default: 0.3,
        },
    ],
    async execute(params) {
        try {
            const { path, confidence = 0.3 } = params;
            logger.debug(`OCR recognize file: ${path}, confidence: ${confidence}`);
            const results = await ocr.recognizeFile(path, confidence);
            return {
                success: true,
                output: {
                    results,
                    count: results.length,
                    path,
                    confidence,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'OCR_RECOGNIZE_FAILED',
                    message: error instanceof Error ? error.message : 'OCR recognition failed',
                },
            };
        }
    },
};
/**
 * All OCR tools
 */
export const ocrTools = [
    ocrRecognizeScreenTool,
    ocrRecognizeScreenDetailsTool,
    ocrRecognizeFileTool,
];
