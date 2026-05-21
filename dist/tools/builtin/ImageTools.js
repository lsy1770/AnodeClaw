/**
 * Image Processing Tools
 *
 * Built-in tools for image processing using Anode image
 * Based on anode-api.d.ts definitions
 */
import { z } from 'zod';
import { logger } from '../../utils/logger.js';
/**
 * Load Image Tool
 */
export const loadImageTool = {
    name: 'load_image',
    description: 'Load an image from file path',
    category: 'image',
    permissions: ['file:read'],
    parallelizable: true,
    parameters: [
        {
            name: 'path',
            description: 'Path to the image file',
            schema: z.string(),
            required: true,
        },
    ],
    async execute(params, options) {
        try {
            const { path } = params;
            logger.debug(`Loading image: ${path}`);
            const bitmap = await image.loadImage(path);
            if (!bitmap) {
                throw new Error('Failed to load image - null bitmap returned');
            }
            return {
                success: true,
                output: {
                    loaded: true,
                    path,
                    bitmap, // Return bitmap for chaining with other image operations
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'LOAD_IMAGE_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to load image',
                    details: error,
                },
            };
        }
    },
};
/**
 * Resize Image Tool
 */
export const resizeImageTool = {
    name: 'resize_image',
    description: 'Resize an image to specified dimensions',
    category: 'image',
    permissions: ['file:read', 'file:write'],
    parallelizable: true,
    parameters: [
        {
            name: 'inputPath',
            description: 'Path to the input image',
            schema: z.string(),
            required: true,
        },
        {
            name: 'outputPath',
            description: 'Path to save the resized image',
            schema: z.string(),
            required: true,
        },
        {
            name: 'width',
            description: 'New width in pixels',
            schema: z.number().int().min(1),
            required: true,
        },
        {
            name: 'height',
            description: 'New height in pixels',
            schema: z.number().int().min(1),
            required: true,
        },
        {
            name: 'format',
            description: 'Output format: png or jpg (default: png)',
            schema: z.enum(['png', 'jpg']),
            required: false,
            default: 'png',
        },
        {
            name: 'quality',
            description: 'Image quality 1-100 (default: 90)',
            schema: z.number().int().min(1).max(100),
            required: false,
            default: 90,
        },
    ],
    async execute(params, options) {
        try {
            const { inputPath, outputPath, width, height, format = 'png', quality = 90 } = params;
            logger.debug(`Resizing image: ${inputPath} to ${width}x${height}`);
            const bitmap = await image.loadImage(inputPath);
            if (!bitmap) {
                throw new Error('Failed to load input image');
            }
            const resized = await image.resize(bitmap, width, height);
            if (!resized) {
                throw new Error('Failed to resize image');
            }
            await image.saveImage(resized, outputPath, format, quality);
            return {
                success: true,
                output: {
                    action: 'resize_image',
                    inputPath,
                    outputPath,
                    width,
                    height,
                    format,
                    message: 'Image resized successfully',
                },
                attachments: [{
                        type: 'image',
                        localPath: outputPath,
                        mimeType: format === 'png' ? 'image/png' : 'image/jpeg',
                    }],
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'RESIZE_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to resize image',
                    details: error,
                },
            };
        }
    },
};
/**
 * Crop Image Tool
 */
export const cropImageTool = {
    name: 'crop_image',
    description: 'Crop a region from an image',
    category: 'image',
    permissions: ['file:read', 'file:write'],
    parallelizable: true,
    parameters: [
        {
            name: 'inputPath',
            description: 'Path to the input image',
            schema: z.string(),
            required: true,
        },
        {
            name: 'outputPath',
            description: 'Path to save the cropped image',
            schema: z.string(),
            required: true,
        },
        {
            name: 'x',
            description: 'X coordinate of crop region',
            schema: z.number().int().min(0),
            required: true,
        },
        {
            name: 'y',
            description: 'Y coordinate of crop region',
            schema: z.number().int().min(0),
            required: true,
        },
        {
            name: 'width',
            description: 'Width of crop region',
            schema: z.number().int().min(1),
            required: true,
        },
        {
            name: 'height',
            description: 'Height of crop region',
            schema: z.number().int().min(1),
            required: true,
        },
        {
            name: 'format',
            description: 'Output format: png or jpg (default: png)',
            schema: z.enum(['png', 'jpg']),
            required: false,
            default: 'png',
        },
    ],
    async execute(params, options) {
        try {
            const { inputPath, outputPath, x, y, width, height, format = 'png' } = params;
            logger.debug(`Cropping image: ${inputPath} region (${x},${y},${width},${height})`);
            const bitmap = await image.loadImage(inputPath);
            if (!bitmap) {
                throw new Error('Failed to load input image');
            }
            const cropped = await image.crop(bitmap, x, y, width, height);
            if (!cropped) {
                throw new Error('Failed to crop image');
            }
            await image.saveImage(cropped, outputPath, format);
            return {
                success: true,
                output: {
                    action: 'crop_image',
                    inputPath,
                    outputPath,
                    region: { x, y, width, height },
                    message: 'Image cropped successfully',
                },
                attachments: [{
                        type: 'image',
                        localPath: outputPath,
                        mimeType: format === 'png' ? 'image/png' : 'image/jpeg',
                    }],
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'CROP_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to crop image',
                    details: error,
                },
            };
        }
    },
};
/**
 * Rotate Image Tool
 */
export const rotateImageTool = {
    name: 'rotate_image',
    description: 'Rotate an image by specified degrees',
    category: 'image',
    permissions: ['file:read', 'file:write'],
    parallelizable: true,
    parameters: [
        {
            name: 'inputPath',
            description: 'Path to the input image',
            schema: z.string(),
            required: true,
        },
        {
            name: 'outputPath',
            description: 'Path to save the rotated image',
            schema: z.string(),
            required: true,
        },
        {
            name: 'degrees',
            description: 'Rotation angle in degrees (positive = clockwise)',
            schema: z.number(),
            required: true,
        },
        {
            name: 'format',
            description: 'Output format: png or jpg (default: png)',
            schema: z.enum(['png', 'jpg']),
            required: false,
            default: 'png',
        },
    ],
    async execute(params, options) {
        try {
            const { inputPath, outputPath, degrees, format = 'png' } = params;
            logger.debug(`Rotating image: ${inputPath} by ${degrees} degrees`);
            const bitmap = await image.loadImage(inputPath);
            if (!bitmap) {
                throw new Error('Failed to load input image');
            }
            const rotated = await image.rotate(bitmap, degrees);
            if (!rotated) {
                throw new Error('Failed to rotate image');
            }
            await image.saveImage(rotated, outputPath, format);
            return {
                success: true,
                output: {
                    action: 'rotate_image',
                    inputPath,
                    outputPath,
                    degrees,
                    message: 'Image rotated successfully',
                },
                attachments: [{
                        type: 'image',
                        localPath: outputPath,
                        mimeType: format === 'png' ? 'image/png' : 'image/jpeg',
                    }],
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'ROTATE_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to rotate image',
                    details: error,
                },
            };
        }
    },
};
/**
 * Flip Image Tool
 */
export const flipImageTool = {
    name: 'flip_image',
    description: 'Flip an image horizontally or vertically',
    category: 'image',
    permissions: ['file:read', 'file:write'],
    parallelizable: true,
    parameters: [
        {
            name: 'inputPath',
            description: 'Path to the input image',
            schema: z.string(),
            required: true,
        },
        {
            name: 'outputPath',
            description: 'Path to save the flipped image',
            schema: z.string(),
            required: true,
        },
        {
            name: 'horizontal',
            description: 'Flip horizontally (default: true). If false, flips vertically.',
            schema: z.boolean(),
            required: false,
            default: true,
        },
        {
            name: 'format',
            description: 'Output format: png or jpg (default: png)',
            schema: z.enum(['png', 'jpg']),
            required: false,
            default: 'png',
        },
    ],
    async execute(params, options) {
        try {
            const { inputPath, outputPath, horizontal = true, format = 'png' } = params;
            logger.debug(`Flipping image: ${inputPath} (horizontal: ${horizontal})`);
            const bitmap = await image.loadImage(inputPath);
            if (!bitmap) {
                throw new Error('Failed to load input image');
            }
            const flipped = await image.flip(bitmap, horizontal);
            if (!flipped) {
                throw new Error('Failed to flip image');
            }
            await image.saveImage(flipped, outputPath, format);
            return {
                success: true,
                output: {
                    action: 'flip_image',
                    inputPath,
                    outputPath,
                    horizontal,
                    message: 'Image flipped successfully',
                },
                attachments: [{
                        type: 'image',
                        localPath: outputPath,
                        mimeType: format === 'png' ? 'image/png' : 'image/jpeg',
                    }],
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'FLIP_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to flip image',
                    details: error,
                },
            };
        }
    },
};
/**
 * Find Image Tool
 */
export const findImageTool = {
    name: 'find_image',
    description: 'Find a template image within a source image',
    category: 'image',
    permissions: ['file:read'],
    parallelizable: true,
    parameters: [
        {
            name: 'sourcePath',
            description: 'Path to the source image (where to search)',
            schema: z.string(),
            required: true,
        },
        {
            name: 'templatePath',
            description: 'Path to the template image (what to find)',
            schema: z.string(),
            required: true,
        },
        {
            name: 'threshold',
            description: 'Match threshold (0.0 to 1.0, default: 0.9)',
            schema: z.number().min(0).max(1),
            required: false,
            default: 0.9,
        },
        {
            name: 'region',
            description: 'Search region {x, y, width, height} (optional)',
            schema: z.object({
                x: z.number().int().min(0),
                y: z.number().int().min(0),
                width: z.number().int().min(1),
                height: z.number().int().min(1),
            }),
            required: false,
        },
    ],
    async execute(params, options) {
        try {
            const { sourcePath, templatePath, threshold = 0.9, region } = params;
            logger.debug(`Finding image: ${templatePath} in ${sourcePath}`);
            const source = await image.loadImage(sourcePath);
            const template = await image.loadImage(templatePath);
            if (!source || !template) {
                throw new Error('Failed to load source or template image');
            }
            const result = await image.findImage(source, template, threshold, region || null);
            return {
                success: true,
                output: {
                    found: !!result,
                    match: result ? {
                        x: result.x,
                        y: result.y,
                        similarity: result.similarity,
                    } : null,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'FIND_IMAGE_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to find image',
                    details: error,
                },
            };
        }
    },
};
/**
 * Find All Images Tool
 */
export const findAllImagesTool = {
    name: 'find_all_images',
    description: 'Find all occurrences of a template image within a source image',
    category: 'image',
    permissions: ['file:read'],
    parallelizable: true,
    parameters: [
        {
            name: 'sourcePath',
            description: 'Path to the source image',
            schema: z.string(),
            required: true,
        },
        {
            name: 'templatePath',
            description: 'Path to the template image',
            schema: z.string(),
            required: true,
        },
        {
            name: 'threshold',
            description: 'Match threshold (0.0 to 1.0, default: 0.9)',
            schema: z.number().min(0).max(1),
            required: false,
            default: 0.9,
        },
        {
            name: 'maxResults',
            description: 'Maximum number of results (default: 10)',
            schema: z.number().int().min(1),
            required: false,
            default: 10,
        },
    ],
    async execute(params, options) {
        try {
            const { sourcePath, templatePath, threshold = 0.9, maxResults = 10 } = params;
            logger.debug(`Finding all images: ${templatePath} in ${sourcePath}`);
            const source = await image.loadImage(sourcePath);
            const template = await image.loadImage(templatePath);
            if (!source || !template) {
                throw new Error('Failed to load source or template image');
            }
            const results = await image.findAllImages(source, template, threshold, null, maxResults);
            return {
                success: true,
                output: {
                    count: results.length,
                    matches: results.map((r) => ({
                        x: r.x,
                        y: r.y,
                        similarity: r.similarity,
                    })),
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'FIND_ALL_IMAGES_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to find images',
                    details: error,
                },
            };
        }
    },
};
/**
 * Find Color Tool
 */
export const findColorTool = {
    name: 'find_color',
    description: 'Find a specific color in an image',
    category: 'image',
    permissions: ['file:read'],
    parallelizable: true,
    parameters: [
        {
            name: 'imagePath',
            description: 'Path to the image (or "screen" to use current screen)',
            schema: z.string(),
            required: true,
        },
        {
            name: 'color',
            description: 'Color to find (hex format, e.g., "#FF0000")',
            schema: z.string(),
            required: true,
        },
        {
            name: 'threshold',
            description: 'Color similarity threshold (default: 4)',
            schema: z.number().int().min(0),
            required: false,
            default: 4,
        },
        {
            name: 'region',
            description: 'Search region {x, y, width, height} (optional)',
            schema: z.object({
                x: z.number().int().min(0),
                y: z.number().int().min(0),
                width: z.number().int().min(1),
                height: z.number().int().min(1),
            }),
            required: false,
        },
    ],
    async execute(params, options) {
        try {
            const { imagePath, color, threshold = 4, region } = params;
            logger.debug(`Finding color: ${color} in ${imagePath}`);
            let bitmap;
            if (imagePath === 'screen') {
                bitmap = await image.captureScreenWithAccessibility();
            }
            else {
                bitmap = await image.loadImage(imagePath);
            }
            if (!bitmap) {
                throw new Error('Failed to load image');
            }
            const result = await image.findColor(bitmap, color, threshold, region || null);
            return {
                success: true,
                output: {
                    found: !!result,
                    point: result ? { x: result.x, y: result.y } : null,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'FIND_COLOR_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to find color',
                    details: error,
                },
            };
        }
    },
};
/**
 * Gaussian Blur Tool
 */
export const gaussianBlurTool = {
    name: 'gaussian_blur',
    description: 'Apply Gaussian blur to an image',
    category: 'image',
    permissions: ['file:read', 'file:write'],
    parallelizable: true,
    parameters: [
        {
            name: 'inputPath',
            description: 'Path to the input image',
            schema: z.string(),
            required: true,
        },
        {
            name: 'outputPath',
            description: 'Path to save the blurred image',
            schema: z.string(),
            required: true,
        },
        {
            name: 'kernelSize',
            description: 'Blur kernel size (odd number, default: 5)',
            schema: z.number().int().min(1),
            required: false,
            default: 5,
        },
        {
            name: 'format',
            description: 'Output format: png or jpg (default: png)',
            schema: z.enum(['png', 'jpg']),
            required: false,
            default: 'png',
        },
    ],
    async execute(params, options) {
        try {
            const { inputPath, outputPath, kernelSize = 5, format = 'png' } = params;
            logger.debug(`Applying Gaussian blur: ${inputPath} (kernel: ${kernelSize})`);
            const bitmap = await image.loadImage(inputPath);
            if (!bitmap) {
                throw new Error('Failed to load input image');
            }
            const blurred = await image.gaussianBlur(bitmap, kernelSize);
            if (!blurred) {
                throw new Error('Failed to apply Gaussian blur');
            }
            await image.saveImage(blurred, outputPath, format);
            return {
                success: true,
                output: {
                    action: 'gaussian_blur',
                    inputPath,
                    outputPath,
                    kernelSize,
                    message: 'Gaussian blur applied successfully',
                },
                attachments: [{
                        type: 'image',
                        localPath: outputPath,
                        mimeType: format === 'png' ? 'image/png' : 'image/jpeg',
                    }],
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'BLUR_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to apply blur',
                    details: error,
                },
            };
        }
    },
};
/**
 * Edge Detection Tool
 */
export const edgeDetectionTool = {
    name: 'edge_detection',
    description: 'Apply Canny edge detection to an image',
    category: 'image',
    permissions: ['file:read', 'file:write'],
    parallelizable: true,
    parameters: [
        {
            name: 'inputPath',
            description: 'Path to the input image',
            schema: z.string(),
            required: true,
        },
        {
            name: 'outputPath',
            description: 'Path to save the edge-detected image',
            schema: z.string(),
            required: true,
        },
        {
            name: 'lowThreshold',
            description: 'Low threshold for edge detection (default: 50)',
            schema: z.number().min(0),
            required: false,
            default: 50,
        },
        {
            name: 'highThreshold',
            description: 'High threshold for edge detection (default: 150)',
            schema: z.number().min(0),
            required: false,
            default: 150,
        },
    ],
    async execute(params, options) {
        try {
            const { inputPath, outputPath, lowThreshold = 50, highThreshold = 150 } = params;
            logger.debug(`Applying edge detection: ${inputPath}`);
            const bitmap = await image.loadImage(inputPath);
            if (!bitmap) {
                throw new Error('Failed to load input image');
            }
            const edges = await image.cannyEdgeDetection(bitmap, lowThreshold, highThreshold);
            if (!edges) {
                throw new Error('Failed to apply edge detection');
            }
            await image.saveImage(edges, outputPath, 'png');
            return {
                success: true,
                output: {
                    action: 'edge_detection',
                    inputPath,
                    outputPath,
                    lowThreshold,
                    highThreshold,
                    message: 'Edge detection applied successfully',
                },
                attachments: [{
                        type: 'image',
                        localPath: outputPath,
                        mimeType: 'image/png',
                    }],
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'EDGE_DETECTION_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to apply edge detection',
                    details: error,
                },
            };
        }
    },
};
/**
 * Image to Base64 Tool
 */
export const imageToBase64Tool = {
    name: 'image_to_base64',
    description: 'Convert an image file to Base64 string',
    category: 'image',
    permissions: ['file:read'],
    parallelizable: true,
    parameters: [
        {
            name: 'path',
            description: 'Path to the image file',
            schema: z.string(),
            required: true,
        },
        {
            name: 'format',
            description: 'Output format: png or jpg (default: png)',
            schema: z.enum(['png', 'jpg']),
            required: false,
            default: 'png',
        },
        {
            name: 'quality',
            description: 'Image quality 1-100 for jpg (default: 90)',
            schema: z.number().int().min(1).max(100),
            required: false,
            default: 90,
        },
    ],
    async execute(params, options) {
        try {
            const { path, format = 'png', quality = 90 } = params;
            logger.debug(`Converting image to Base64: ${path}`);
            const bitmap = await image.loadImage(path);
            if (!bitmap) {
                throw new Error('Failed to load image');
            }
            const base64 = await image.toBase64(bitmap, format, quality);
            return {
                success: true,
                output: {
                    path,
                    format,
                    base64,
                    length: base64.length,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'TO_BASE64_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to convert to Base64',
                    details: error,
                },
            };
        }
    },
};
/**
 * Generate Image Tool (Z-Image / DashScope text-to-image)
 *
 * Calls the Alibaba DashScope Z-Image API to generate an image from a text prompt.
 * The generated image is downloaded and saved to the device.
 * Requires DASHSCOPE_API_KEY in config (imageGeneration.apiKey).
 */
export const generateImageTool = {
    name: 'generate_image',
    description: 'Generate an image from a text prompt using the Z-Image AI model. ' +
        'Supports Chinese and English text rendering, multiple aspect ratios. ' +
        'Returns the local path to the generated PNG image.',
    category: 'image',
    permissions: ['network:http', 'file:write'],
    parallelizable: true,
    parameters: [
        {
            name: 'prompt',
            description: 'Text prompt describing the image to generate (Chinese or English, max 800 chars)',
            schema: z.string().min(1).max(800),
            required: true,
        },
        {
            name: 'size',
            description: 'Output image resolution as "width*height". Total pixels must be in [512*512, 2048*2048]. ' +
                'Recommended sizes: 1024*1024 (1:1), 1024*1536 (2:3), 1536*1024 (3:2), 1280*720 (16:9), 720*1280 (9:16). ' +
                'Default: 1024*1536',
            schema: z.string().regex(/^\d+\*\d+$/),
            required: false,
            default: '1024*1536',
        },
        {
            name: 'outputPath',
            description: 'Path to save the generated image. Default: ./data/generated/<timestamp>.png',
            schema: z.string(),
            required: false,
        },
        {
            name: 'promptExtend',
            description: 'Enable smart prompt rewriting using a large model. Improves results but costs more and is slower. Default: false',
            schema: z.boolean(),
            required: false,
            default: false,
        },
        {
            name: 'seed',
            description: 'Random seed (0-2147483647) for reproducible results. Same seed produces similar (not identical) outputs.',
            schema: z.number().int().min(0).max(2147483647),
            required: false,
        },
    ],
    async execute(params, options) {
        try {
            const { prompt, size = '1024*1536', outputPath, promptExtend = false, seed, } = params;
            // Resolve API key from config or environment
            const apiKey = options?.config?.imageGeneration?.apiKey ||
                (typeof process !== 'undefined' && process.env?.DASHSCOPE_API_KEY) ||
                '';
            if (!apiKey) {
                return {
                    success: false,
                    error: {
                        code: 'MISSING_API_KEY',
                        message: 'DashScope API key not configured. Set imageGeneration.apiKey in config or DASHSCOPE_API_KEY environment variable.',
                    },
                };
            }
            // Resolve API endpoint
            const baseURL = options?.config?.imageGeneration?.baseURL ||
                'https://dashscope.aliyuncs.com';
            const apiURL = `${baseURL}/api/v1/services/aigc/multimodal-generation/generation`;
            // Validate size: total pixels in [512*512, 2048*2048]
            const [w, h] = size.split('*').map(Number);
            const totalPixels = w * h;
            if (totalPixels < 512 * 512 || totalPixels > 2048 * 2048) {
                return {
                    success: false,
                    error: {
                        code: 'INVALID_SIZE',
                        message: `Total pixels (${w}x${h}=${totalPixels}) must be in [${512 * 512}, ${2048 * 2048}]`,
                    },
                };
            }
            logger.info(`Generating image: prompt="${prompt.substring(0, 50)}...", size=${size}`);
            // Build request body
            const requestBody = {
                model: options?.config?.imageGeneration?.model || 'z-image-turbo',
                input: {
                    messages: [
                        {
                            role: 'user',
                            content: [{ text: prompt }],
                        },
                    ],
                },
                parameters: {
                    size,
                    prompt_extend: promptExtend,
                },
            };
            if (seed !== undefined) {
                requestBody.parameters.seed = seed;
            }
            // Call Z-Image API
            const headers = {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            };
            const response = await http.httpPost(apiURL, JSON.stringify(requestBody), headers);
            // Parse response
            let responseData;
            if (typeof response === 'string') {
                responseData = JSON.parse(response);
            }
            else if (response?.body && typeof response.body === 'string') {
                responseData = JSON.parse(response.body);
            }
            else {
                responseData = response;
            }
            // Check for API error
            if (responseData.code) {
                return {
                    success: false,
                    error: {
                        code: responseData.code,
                        message: responseData.message || 'Z-Image API error',
                        details: responseData,
                    },
                };
            }
            // Extract image URL from response
            const choices = responseData.output?.choices;
            if (!choices || choices.length === 0) {
                return {
                    success: false,
                    error: {
                        code: 'NO_IMAGE_GENERATED',
                        message: 'API returned no image in response',
                        details: responseData,
                    },
                };
            }
            const content = choices[0]?.message?.content;
            const imageUrl = content?.find((c) => c.image)?.image;
            const returnedText = content?.find((c) => c.text)?.text;
            const reasoningContent = choices[0]?.message?.reasoning_content;
            if (!imageUrl) {
                return {
                    success: false,
                    error: {
                        code: 'NO_IMAGE_URL',
                        message: 'API response did not contain an image URL',
                        details: responseData,
                    },
                };
            }
            // Determine output path
            const savePath = outputPath || `./data/generated/${Date.now()}.png`;
            // Ensure output directory exists
            const dirPath = savePath.substring(0, savePath.lastIndexOf('/'));
            if (dirPath) {
                await file.createDirectory(dirPath);
            }
            // Download the image
            logger.debug(`Downloading generated image from: ${imageUrl}`);
            const imageResponse = await http.httpGet(imageUrl);
            // Save image bytes
            let saved = false;
            if (imageResponse instanceof Uint8Array) {
                saved = await file.writeBytes(savePath, imageResponse);
            }
            else if (imageResponse?.bytes instanceof Uint8Array) {
                saved = await file.writeBytes(savePath, imageResponse.bytes);
            }
            else {
                // Fallback: use Anode image API to load from URL and save
                const bitmap = await image.loadImage(imageUrl);
                if (bitmap) {
                    saved = await image.saveImage(bitmap, savePath, 'png', 100);
                }
            }
            if (!saved) {
                return {
                    success: false,
                    error: {
                        code: 'SAVE_FAILED',
                        message: `Failed to save generated image to ${savePath}. Image URL (valid 24h): ${imageUrl}`,
                    },
                };
            }
            logger.info(`Image generated and saved to: ${savePath}`);
            const result = {
                success: true,
                output: {
                    action: 'generate_image',
                    savedPath: savePath,
                    imageUrl,
                    size,
                    prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
                    promptExtend,
                    usage: responseData.usage,
                    message: `Image generated and saved to ${savePath}`,
                },
                attachments: [
                    {
                        type: 'image',
                        localPath: savePath,
                        mimeType: 'image/png',
                    },
                ],
            };
            // Include rewritten prompt and reasoning if prompt_extend was on
            if (promptExtend && returnedText) {
                result.output.rewrittenPrompt = returnedText;
            }
            if (promptExtend && reasoningContent) {
                result.output.reasoning = reasoningContent;
            }
            return result;
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'GENERATE_IMAGE_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to generate image',
                    details: error,
                },
            };
        }
    },
};
/**
 * All image tools
 */
export const imageTools = [
    loadImageTool,
    resizeImageTool,
    cropImageTool,
    rotateImageTool,
    flipImageTool,
    findImageTool,
    findAllImagesTool,
    findColorTool,
    gaussianBlurTool,
    edgeDetectionTool,
    imageToBase64Tool,
    generateImageTool,
];
