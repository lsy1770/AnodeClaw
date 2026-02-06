/**
 * Media Tools
 *
 * Built-in tools for audio/video operations using Anode media
 * Based on anode-api.d.ts definitions
 */
import { z } from 'zod';
import { logger } from '../../utils/logger.js';
/**
 * Play Audio Tool
 */
export const playAudioTool = {
    name: 'play_audio',
    description: 'Play an audio file',
    category: 'media',
    permissions: ['media:play'],
    parallelizable: false,
    parameters: [
        {
            name: 'path',
            description: 'Path to the audio file',
            schema: z.string(),
            required: true,
        },
        {
            name: 'loop',
            description: 'Loop the audio playback (default: false)',
            schema: z.boolean(),
            required: false,
            default: false,
        },
    ],
    async execute(params, options) {
        try {
            const { path, loop = false } = params;
            logger.debug(`Playing audio: ${path} (loop: ${loop})`);
            await media.playAudio(path, loop);
            return {
                success: true,
                output: {
                    action: 'play_audio',
                    path,
                    loop,
                    message: 'Audio playback started',
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'PLAY_AUDIO_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to play audio',
                    details: error,
                },
            };
        }
    },
};
/**
 * Pause Playback Tool
 */
export const pausePlaybackTool = {
    name: 'pause_playback',
    description: 'Pause current audio playback',
    category: 'media',
    permissions: ['media:play'],
    parallelizable: false,
    parameters: [],
    async execute(params, options) {
        try {
            logger.debug('Pausing playback');
            await media.pausePlayback();
            return {
                success: true,
                output: {
                    action: 'pause_playback',
                    message: 'Playback paused',
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'PAUSE_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to pause playback',
                    details: error,
                },
            };
        }
    },
};
/**
 * Resume Playback Tool
 */
export const resumePlaybackTool = {
    name: 'resume_playback',
    description: 'Resume paused audio playback',
    category: 'media',
    permissions: ['media:play'],
    parallelizable: false,
    parameters: [],
    async execute(params, options) {
        try {
            logger.debug('Resuming playback');
            await media.resumePlayback();
            return {
                success: true,
                output: {
                    action: 'resume_playback',
                    message: 'Playback resumed',
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'RESUME_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to resume playback',
                    details: error,
                },
            };
        }
    },
};
/**
 * Stop Playback Tool
 */
export const stopPlaybackTool = {
    name: 'stop_playback',
    description: 'Stop current audio playback',
    category: 'media',
    permissions: ['media:play'],
    parallelizable: false,
    parameters: [],
    async execute(params, options) {
        try {
            logger.debug('Stopping playback');
            await media.stopPlayback();
            return {
                success: true,
                output: {
                    action: 'stop_playback',
                    message: 'Playback stopped',
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'STOP_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to stop playback',
                    details: error,
                },
            };
        }
    },
};
/**
 * Seek To Tool
 */
export const seekToTool = {
    name: 'seek_to',
    description: 'Seek to a specific position in the audio',
    category: 'media',
    permissions: ['media:play'],
    parallelizable: false,
    parameters: [
        {
            name: 'position',
            description: 'Position in milliseconds',
            schema: z.number().int().min(0),
            required: true,
        },
    ],
    async execute(params, options) {
        try {
            const { position } = params;
            logger.debug(`Seeking to position: ${position}ms`);
            await media.seekTo(position);
            return {
                success: true,
                output: {
                    action: 'seek_to',
                    position,
                    message: `Seeked to ${position}ms`,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'SEEK_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to seek',
                    details: error,
                },
            };
        }
    },
};
/**
 * Get Playback Position Tool
 */
export const getPlaybackPositionTool = {
    name: 'get_playback_position',
    description: 'Get the current playback position',
    category: 'media',
    permissions: ['media:read'],
    parallelizable: true,
    parameters: [],
    async execute(params, options) {
        try {
            logger.debug('Getting playback position');
            const position = await media.getPlaybackPosition();
            const duration = await media.getDuration();
            return {
                success: true,
                output: {
                    position,
                    duration,
                    progress: duration > 0 ? (position / duration) * 100 : 0,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'GET_POSITION_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to get playback position',
                    details: error,
                },
            };
        }
    },
};
/**
 * Set Playback Speed Tool
 */
export const setPlaybackSpeedTool = {
    name: 'set_playback_speed',
    description: 'Set the playback speed',
    category: 'media',
    permissions: ['media:play'],
    parallelizable: false,
    parameters: [
        {
            name: 'speed',
            description: 'Playback speed (0.5 = half speed, 1.0 = normal, 2.0 = double speed)',
            schema: z.number().min(0.25).max(4.0),
            required: true,
        },
    ],
    async execute(params, options) {
        try {
            const { speed } = params;
            logger.debug(`Setting playback speed: ${speed}x`);
            await media.setPlaybackSpeed(speed);
            return {
                success: true,
                output: {
                    action: 'set_playback_speed',
                    speed,
                    message: `Playback speed set to ${speed}x`,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'SET_SPEED_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to set playback speed',
                    details: error,
                },
            };
        }
    },
};
/**
 * Set Media Volume Tool
 */
export const setMediaVolumeTool = {
    name: 'set_media_volume',
    description: 'Set the media playback volume (left and right channels)',
    category: 'media',
    permissions: ['media:play'],
    parallelizable: false,
    parameters: [
        {
            name: 'leftVolume',
            description: 'Left channel volume (0.0 to 1.0)',
            schema: z.number().min(0).max(1),
            required: true,
        },
        {
            name: 'rightVolume',
            description: 'Right channel volume (0.0 to 1.0)',
            schema: z.number().min(0).max(1),
            required: true,
        },
    ],
    async execute(params, options) {
        try {
            const { leftVolume, rightVolume } = params;
            logger.debug(`Setting media volume: L=${leftVolume}, R=${rightVolume}`);
            await media.setVolume(leftVolume, rightVolume);
            return {
                success: true,
                output: {
                    action: 'set_media_volume',
                    leftVolume,
                    rightVolume,
                    message: 'Media volume set',
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'SET_VOLUME_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to set volume',
                    details: error,
                },
            };
        }
    },
};
/**
 * Start Audio Recording Tool
 */
export const startAudioRecordingTool = {
    name: 'start_audio_recording',
    description: 'Start recording audio to a file',
    category: 'media',
    permissions: ['media:record'],
    parallelizable: false,
    parameters: [
        {
            name: 'outputPath',
            description: 'Path to save the recording',
            schema: z.string(),
            required: true,
        },
    ],
    async execute(params, options) {
        try {
            const { outputPath } = params;
            logger.debug(`Starting audio recording: ${outputPath}`);
            await media.startAudioRecording(outputPath);
            return {
                success: true,
                output: {
                    action: 'start_audio_recording',
                    outputPath,
                    message: 'Audio recording started',
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'START_RECORDING_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to start recording',
                    details: error,
                },
            };
        }
    },
};
/**
 * Stop Audio Recording Tool
 */
export const stopAudioRecordingTool = {
    name: 'stop_audio_recording',
    description: 'Stop the current audio recording',
    category: 'media',
    permissions: ['media:record'],
    parallelizable: false,
    parameters: [],
    async execute(params, options) {
        try {
            logger.debug('Stopping audio recording');
            await media.stopAudioRecording();
            return {
                success: true,
                output: {
                    action: 'stop_audio_recording',
                    message: 'Audio recording stopped',
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'STOP_RECORDING_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to stop recording',
                    details: error,
                },
            };
        }
    },
};
/**
 * All media tools
 */
export const mediaTools = [
    playAudioTool,
    pausePlaybackTool,
    resumePlaybackTool,
    stopPlaybackTool,
    seekToTool,
    getPlaybackPositionTool,
    setPlaybackSpeedTool,
    setMediaVolumeTool,
    startAudioRecordingTool,
    stopAudioRecordingTool,
];
