/**
 * Weather Plugin
 *
 * Provides weather information tools.
 * This is an example plugin demonstrating the plugin system.
 */
import { z } from 'zod';
/**
 * Weather Plugin implementation
 */
export default class WeatherPlugin {
    constructor() {
        this.metadata = {
            id: 'weather',
            name: 'Weather Plugin',
            version: '1.0.0',
            description: 'Get weather information for any city',
            author: 'Anode ClawdBot Team',
            license: 'MIT',
            permissions: ['network:http'],
        };
        this.apiKey = '';
    }
    async init(context) {
        this.context = context;
        // Get API key from settings
        this.apiKey = context.pluginConfig.settings.apiKey || '';
        if (!this.apiKey) {
            context.log('warn', 'Weather API key not configured');
        }
        context.log('info', 'Weather plugin initialized');
    }
    async destroy() {
        this.context.log('info', 'Weather plugin destroyed');
    }
    getTools() {
        return [
            {
                name: 'get_weather',
                description: 'Get current weather information for a city',
                parameters: [
                    {
                        name: 'city',
                        description: 'City name (e.g., "London", "New York")',
                        schema: z.string().min(1),
                        required: true,
                    },
                    {
                        name: 'units',
                        description: 'Temperature units (metric or imperial)',
                        schema: z.enum(['metric', 'imperial']).optional(),
                        required: false,
                    },
                ],
                execute: async (params) => {
                    try {
                        const result = await this.getWeather(params);
                        return {
                            success: true,
                            output: result,
                        };
                    }
                    catch (error) {
                        return {
                            success: false,
                            error: {
                                code: 'WEATHER_ERROR',
                                message: error instanceof Error ? error.message : String(error),
                            },
                        };
                    }
                },
            },
            {
                name: 'get_forecast',
                description: 'Get weather forecast for a city (3-day)',
                parameters: [
                    {
                        name: 'city',
                        description: 'City name',
                        schema: z.string().min(1),
                        required: true,
                    },
                    {
                        name: 'days',
                        description: 'Number of days (1-3)',
                        schema: z.number().min(1).max(3).optional(),
                        required: false,
                    },
                ],
                execute: async (params) => {
                    try {
                        const result = await this.getForecast(params);
                        return {
                            success: true,
                            output: result,
                        };
                    }
                    catch (error) {
                        return {
                            success: false,
                            error: {
                                code: 'FORECAST_ERROR',
                                message: error instanceof Error ? error.message : String(error),
                            },
                        };
                    }
                },
            },
        ];
    }
    getConfigSchema() {
        return {
            fields: [
                {
                    key: 'apiKey',
                    label: 'Weather API Key',
                    type: 'password',
                    description: 'OpenWeatherMap API key (get from openweathermap.org)',
                    required: true,
                },
                {
                    key: 'defaultUnits',
                    label: 'Default Units',
                    type: 'select',
                    description: 'Default temperature units',
                    defaultValue: 'metric',
                    options: [
                        { label: 'Metric (°C)', value: 'metric' },
                        { label: 'Imperial (°F)', value: 'imperial' },
                    ],
                },
            ],
        };
    }
    validateConfig(config) {
        if (!config.apiKey || typeof config.apiKey !== 'string') {
            return 'API key is required';
        }
        if (config.apiKey.length < 10) {
            return 'Invalid API key format';
        }
        return true;
    }
    /**
     * Get current weather
     */
    async getWeather(params) {
        // Validate parameters
        const schema = z.object({
            city: z.string().min(1),
            units: z.enum(['metric', 'imperial']).optional(),
        });
        const parsed = schema.parse(params);
        const units = parsed.units || this.context.pluginConfig.settings.defaultUnits || 'metric';
        if (!this.apiKey) {
            return 'Weather API key not configured. Please configure in plugin settings.';
        }
        try {
            // Mock API response for demonstration
            // In real implementation, call OpenWeatherMap API:
            // const url = `https://api.openweathermap.org/data/2.5/weather?q=${parsed.city}&units=${units}&appid=${this.apiKey}`;
            // const response = await fetch(url);
            // const data = await response.json();
            // Mock response
            const temp = units === 'metric' ? 22 : 72;
            const tempUnit = units === 'metric' ? '°C' : '°F';
            this.context.log('info', `Fetched weather for ${parsed.city}`);
            return JSON.stringify({
                city: parsed.city,
                temperature: temp,
                unit: tempUnit,
                condition: 'Partly Cloudy',
                humidity: '65%',
                windSpeed: units === 'metric' ? '15 km/h' : '9 mph',
                description: `Current weather in ${parsed.city}: ${temp}${tempUnit}, Partly Cloudy`,
            }, null, 2);
        }
        catch (error) {
            this.context.log('error', `Failed to fetch weather: ${error}`);
            throw error;
        }
    }
    /**
     * Get weather forecast
     */
    async getForecast(params) {
        // Validate parameters
        const schema = z.object({
            city: z.string().min(1),
            days: z.number().min(1).max(3).optional(),
        });
        const parsed = schema.parse(params);
        const days = parsed.days || 3;
        if (!this.apiKey) {
            return 'Weather API key not configured. Please configure in plugin settings.';
        }
        try {
            // Mock forecast data
            const forecast = [];
            const baseTemp = 20;
            for (let i = 0; i < days; i++) {
                const date = new Date();
                date.setDate(date.getDate() + i);
                forecast.push({
                    date: date.toISOString().split('T')[0],
                    temperature: {
                        high: baseTemp + Math.random() * 5,
                        low: baseTemp - Math.random() * 3,
                    },
                    condition: ['Sunny', 'Partly Cloudy', 'Cloudy'][Math.floor(Math.random() * 3)],
                });
            }
            this.context.log('info', `Fetched ${days}-day forecast for ${parsed.city}`);
            return JSON.stringify({
                city: parsed.city,
                forecast,
            }, null, 2);
        }
        catch (error) {
            this.context.log('error', `Failed to fetch forecast: ${error}`);
            throw error;
        }
    }
}
