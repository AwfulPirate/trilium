import axios from "axios";
import log from "../../../log.js";
import { BaseEmbeddingProvider } from "../base_embeddings.js";
import type { EmbeddingConfig, EmbeddingModelInfo } from "../embeddings_interface.js";
import { LLM_CONSTANTS } from "../../../../routes/api/llm.js";

// Voyage model context window sizes - as of current API version
const VOYAGE_MODEL_CONTEXT_WINDOWS: Record<string, number> = {
    "voyage-large-2": 8192,
    "voyage-2": 8192,
    "default": 8192
};

// Voyage embedding dimensions
const VOYAGE_MODEL_DIMENSIONS: Record<string, number> = {
    "voyage-large-2": 1536,
    "voyage-2": 1024,
    "default": 1024
};

/**
 * Voyage AI embedding provider implementation
 */
export class VoyageEmbeddingProvider extends BaseEmbeddingProvider {
    name = "voyage";

    constructor(config: EmbeddingConfig) {
        super(config);

        // Set default base URL if not provided
        if (!this.baseUrl) {
            this.baseUrl = "https://api.voyageai.com/v1";
        }
    }

    /**
     * Initialize the provider by detecting model capabilities
     */
    async initialize(): Promise<void> {
        const modelName = this.config.model || "voyage-2";
        try {
            // Detect model capabilities
            const modelInfo = await this.getModelInfo(modelName);

            // Update the config dimension
            this.config.dimension = modelInfo.dimension;

            log.info(`Voyage AI model ${modelName} initialized with dimension ${this.config.dimension} and context window ${modelInfo.contextWindow}`);
        } catch (error: any) {
            log.error(`Error initializing Voyage AI provider: ${error.message}`);
        }
    }

    /**
     * Try to determine Voyage AI model capabilities
     */
    private async fetchModelCapabilities(modelName: string): Promise<EmbeddingModelInfo | null> {
        try {
            // Get context window size from our local registry of known models
            const modelBase = Object.keys(VOYAGE_MODEL_CONTEXT_WINDOWS).find(
                model => modelName.startsWith(model)
            ) || "default";

            const contextWindow = VOYAGE_MODEL_CONTEXT_WINDOWS[modelBase];

            // Get dimension from our registry of known models
            const dimension = VOYAGE_MODEL_DIMENSIONS[modelBase] || VOYAGE_MODEL_DIMENSIONS.default;

            return {
                dimension,
                contextWindow
            };
        } catch (error) {
            log.info(`Could not determine capabilities for Voyage AI model ${modelName}: ${error}`);
            return null;
        }
    }

    /**
     * Get model information including embedding dimensions
     */
    async getModelInfo(modelName: string): Promise<EmbeddingModelInfo> {
        // Check cache first
        if (this.modelInfoCache.has(modelName)) {
            return this.modelInfoCache.get(modelName);
        }

        // Try to determine model capabilities
        const capabilities = await this.fetchModelCapabilities(modelName);
        const contextWindow = capabilities?.contextWindow || 8192; // Default context window for Voyage
        const knownDimension = capabilities?.dimension || 1024; // Default dimension for Voyage models

        // For Voyage, we can use known dimensions or detect with a test call
        try {
            if (knownDimension) {
                // Use known dimension
                const modelInfo: EmbeddingModelInfo = {
                    dimension: knownDimension,
                    contextWindow
                };

                this.modelInfoCache.set(modelName, modelInfo);
                this.config.dimension = knownDimension;

                log.info(`Using known parameters for Voyage AI model ${modelName}: dimension ${knownDimension}, context ${contextWindow}`);
                return modelInfo;
            } else {
                // Detect dimension with a test embedding as fallback
                const testEmbedding = await this.generateEmbeddings("Test");
                const dimension = testEmbedding.length;

                const modelInfo: EmbeddingModelInfo = {
                    dimension,
                    contextWindow
                };

                this.modelInfoCache.set(modelName, modelInfo);
                this.config.dimension = dimension;

                log.info(`Detected Voyage AI model ${modelName} with dimension ${dimension} (context: ${contextWindow})`);
                return modelInfo;
            }
        } catch (error: any) {
            // If detection fails, use defaults
            const dimension = 1024; // Default for Voyage models

            log.info(`Using default parameters for Voyage AI model ${modelName}: dimension ${dimension}, context ${contextWindow}`);

            const modelInfo: EmbeddingModelInfo = { dimension, contextWindow };
            this.modelInfoCache.set(modelName, modelInfo);
            this.config.dimension = dimension;

            return modelInfo;
        }
    }

    /**
     * Generate embeddings for a single text
     */
    async generateEmbeddings(text: string): Promise<Float32Array> {
        try {
            if (!text.trim()) {
                return new Float32Array(this.config.dimension);
            }

            // Get model info to check context window
            const modelName = this.config.model || "voyage-2";
            const modelInfo = await this.getModelInfo(modelName);

            // Trim text if it might exceed context window (rough character estimate)
            const charLimit = modelInfo.contextWindow * 4; // Rough estimate: avg 4 chars per token
            const trimmedText = text.length > charLimit ? text.substring(0, charLimit) : text;

            const response = await axios.post(
                `${this.baseUrl}/embeddings`,
                {
                    model: modelName,
                    input: trimmedText,
                    input_type: "text",
                    truncation: true
                },
                {
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${this.apiKey}`
                    }
                }
            );

            if (response.data && response.data.data && response.data.data[0] && response.data.data[0].embedding) {
                return new Float32Array(response.data.data[0].embedding);
            } else {
                throw new Error("Unexpected response structure from Voyage AI API");
            }
        } catch (error: any) {
            const errorMessage = error.response?.data?.error?.message || error.message || "Unknown error";
            log.error(`Voyage AI embedding error: ${errorMessage}`);
            throw new Error(`Voyage AI embedding error: ${errorMessage}`);
        }
    }

    /**
     * More specific implementation of batch size error detection for Voyage AI
     */
    protected isBatchSizeError(error: any): boolean {
        const errorMessage = error?.message || error?.response?.data?.error?.message || '';
        const voyageBatchSizeErrorPatterns = [
            'batch size', 'too many inputs', 'context length exceeded',
            'token limit', 'rate limit', 'limit exceeded',
            'too long', 'request too large', 'content too large'
        ];

        return voyageBatchSizeErrorPatterns.some(pattern =>
            errorMessage.toLowerCase().includes(pattern.toLowerCase())
        );
    }

    /**
     * Generate embeddings for multiple texts in a single batch
     */
    async generateBatchEmbeddings(texts: string[]): Promise<Float32Array[]> {
        if (texts.length === 0) {
            return [];
        }

        try {
            return await this.processWithAdaptiveBatch(
                texts,
                async (batch) => {
                    if (batch.length === 0) return [];
                    if (batch.length === 1) {
                        return [await this.generateEmbeddings(batch[0])];
                    }

                    // For Voyage AI, we can batch embeddings
                    const modelName = this.config.model || "voyage-2";

                    // Filter out empty texts
                    const validBatch = batch.map(text => text.trim() || " ");

                    const response = await axios.post(
                        `${this.baseUrl}/embeddings`,
                        {
                            model: modelName,
                            input: validBatch,
                            input_type: "text",
                            truncation: true
                        },
                        {
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${this.apiKey}`
                            }
                        }
                    );

                    if (response.data && response.data.data && Array.isArray(response.data.data)) {
                        return response.data.data.map((item: any) =>
                            new Float32Array(item.embedding || [])
                        );
                    } else {
                        throw new Error("Unexpected response structure from Voyage AI batch API");
                    }
                },
                this.isBatchSizeError
            );
        }
        catch (error: any) {
            const errorMessage = error.message || "Unknown error";
            log.error(`Voyage AI batch embedding error: ${errorMessage}`);
            throw new Error(`Voyage AI batch embedding error: ${errorMessage}`);
        }
    }
}
