// src/types/dayjs-plugins.d.ts
import 'dayjs';

declare module 'dayjs' {
    // 인스턴스 메서드
    interface Dayjs {
        tz(timezone?: string, keepLocalTime?: boolean): Dayjs;
    }

    // 네임스페이스 함수들
    namespace dayjs {
        function tz(date?: dayjs.ConfigType, timezone?: string): Dayjs;
        namespace tz {
            function setDefault(timezone?: string): void;
            function guess(): string;
        }
    }
}

// 플러그인 모듈 존재 선언 (런타임은 실제 dayjs 코드가 담당)
declare module 'dayjs/plugin/utc' {
    const plugin: (o: any, c: any) => void;
    export default plugin;
}
declare module 'dayjs/plugin/timezone' {
    const plugin: (o: any, c: any) => void;
    export default plugin;
}