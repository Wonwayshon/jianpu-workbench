package wang.weixuan.flutekeylab;
public class VaultPolicyTest {
    static void check(boolean value) { if (!value) throw new AssertionError(); }
    static void deny(String url) throws Exception { boolean rejected=false;try { CredentialVault.endpoint(url); } catch (Exception e) { rejected=true; } check(rejected); }
    public static void main(String[] args) throws Exception {
        deny("http://example.com/root");deny("https://user:password@example.com/root");deny("https://example.com/root#x");deny("https://example.com:99999/root");
        java.net.URI root=CredentialVault.endpoint("https://example.com/root/");
        check(CredentialVault.allows(root,CredentialVault.endpoint("https://example.com/root/file"),"basic"));
        for(String target:new String[]{"https://other.com/root/file","https://example.com:444/root/file","https://example.com/rooted/file","https://example.com/root/../outside","https://example.com/root/%2e%2e/outside","https://example.com/root/a%2fb"})check(!CredentialVault.allows(root,CredentialVault.endpoint(target),"basic"));
        java.net.URI api=CredentialVault.endpoint("https://example.com/v1/chat/completions");check(CredentialVault.allows(api,api,"bearer"));check(!CredentialVault.allows(api,CredentialVault.endpoint("https://example.com/v1/chat/completions/other"),"bearer"));
        System.out.println("PASS: native HTTPS endpoint validation, exact API binding, WebDAV directory boundary, cross-origin/port/traversal rejection.");
    }
}
// Modified by AI on 2026-10-08 10:06:28
