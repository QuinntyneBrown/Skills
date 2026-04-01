declare function getApiUrl(): string;
declare function getToken(): {
    accessToken: string;
    refreshToken: string;
} | null;
declare function saveToken(tokens: {
    accessToken: string;
    refreshToken: string;
}): void;
declare function clearToken(): void;
declare function request(method: string, urlPath: string, body?: any): Promise<{
    status: number;
    data: any;
}>;
export { request, getToken, saveToken, clearToken, getApiUrl };
