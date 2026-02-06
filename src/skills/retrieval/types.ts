
import type { Config } from '../../config/schema.js';

export interface SkillMetadata {
    name?: string;
    description?: string;
    openclaw?: OpenClawMetadata;
    [key: string]: any;
}

export interface OpenClawMetadata {
    emoji?: string;
    os?: string[];
    requires?: {
        bins?: string[];
        anyBins?: string[];
        env?: string[];
        config?: string[];
    };
    install?: InstallInstruction[];
    always?: boolean;
}

export interface InstallInstruction {
    id: string;
    kind: 'brew' | 'choco' | 'apt' | 'npm' | 'pip' | 'script';
    formula?: string;
    bins?: string[];
    label?: string;
}

export interface SkillEntry {
    name: string;
    description: string;
    location: string;
    content: string; // The markdown content
    metadata: SkillMetadata;
    source: 'bundled' | 'managed' | 'workspace' | 'extra';
}

export interface SkillSystemConfig {
    workspaceDir: string;
    config?: any; // Avoiding strict schema dependency if complex
    managedSkillsDir?: string;
    bundledSkillsDir?: string;
}
