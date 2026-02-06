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
];
