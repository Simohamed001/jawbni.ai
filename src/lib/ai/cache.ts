// نظام caching بسيط للتصنيفات المتشابهة

interface CacheEntry {
  classification: {
    mainCategoryId: string;
    subCategoryId: string | null;
    productName: string;
    rawAiResponse: string | null;
    mainCategoryName: string;
    subCategoryName: string;
  };
  timestamp: number;
}

interface AudioCacheEntry {
  transcription: string | null;
  classification: {
    mainCategoryId: string;
    subCategoryId: string | null;
    productName: string;
    rawAiResponse: string | null;
    mainCategoryName: string;
    subCategoryName: string;
  };
  timestamp: number;
}

// LRU Cache implementation
class ClassificationCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private ttl: number; // Time to live in milliseconds

  constructor(maxSize = 1000, ttlMinutes = 60) {
    this.maxSize = maxSize;
    this.ttl = ttlMinutes * 60 * 1000;
  }

  private normalizeText(text: string): string {
    return text
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ') // تقليل المسافات المتعددة
      .replace(/[^\w\s\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g, '') // إزالة الرموز الخاصة مع الحفاظ على العربية
      .replace(/[أإآ]/g, 'ا') // توحيد حروف العلة العربية
      .replace(/[ة]/g, 'ه') // توحيد التاء المربوطة
      .replace(/[يى]/g, 'ي') // توحيد الياء
      .replace(/[ًٌٍَُّْ]/g, '') // إزالة التشكيل
      .replace(/\s+/g, ' ') // تقليل المسافات المتعددة مرة أخرى بعد التطبيع
      .trim();
  }

  private generateKey(text: string, merchantId: string): string {
    const normalized = this.normalizeText(text);
    return `${merchantId}:${normalized}`;
  }

  get(text: string, merchantId: string): CacheEntry['classification'] | null {
    const key = this.generateKey(text, merchantId);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Check if entry is expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.classification;
  }

  set(text: string, merchantId: string, classification: CacheEntry['classification']): void {
    const key = this.generateKey(text, merchantId);

    // Remove oldest entry if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      classification,
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.cache.clear();
    console.log("[Cache] Cache cleared");
  }

  getStats(): { size: number; maxSize: number; hitRate: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: 0, // يمكن إضافة تتبع الـ hits/misses لاحقاً
    };
  }
}

// Create a singleton instance
export const classificationCache = new ClassificationCache(10000, 120); // 10000 entries, 120 minutes TTL

// Separate cache for audio transcriptions and classifications
class AudioCache {
  private cache: Map<string, AudioCacheEntry> = new Map();
  private maxSize: number;
  private ttl: number;

  constructor(maxSize = 500, ttlMinutes = 120) {
    this.maxSize = maxSize;
    this.ttl = ttlMinutes * 60 * 1000;
  }

  private generateKey(filePath: string, merchantId: string): string {
    // Use file path as key (in production, you might want to use file hash)
    return `audio:${merchantId}:${filePath}`;
  }

  get(filePath: string, merchantId: string): AudioCacheEntry | null {
    const key = this.generateKey(filePath, merchantId);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Check if entry is expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry;
  }

  set(filePath: string, merchantId: string, transcription: string | null, classification: {
    mainCategoryId: string;
    subCategoryId: string | null;
    productName: string;
    rawAiResponse: string | null;
    mainCategoryName: string;
    subCategoryName: string;
  }): void {
    const key = this.generateKey(filePath, merchantId);

    // Remove oldest entry if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      transcription,
      classification,
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.cache.clear();
    console.log("[Cache] Cache cleared");
  }

  getStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }
}

export const audioCache = new AudioCache(500, 120); // 500 audio entries, 120 minutes TTL

// Export the class for testing or custom instances
export { ClassificationCache, AudioCache };
