/** Type declarations for the pure release metadata module used by scripts and release tests. */

export interface ReleaseRegistration {
  readonly kind: 'windows-registry';
  readonly key: string;
}

export interface ReleaseTarget {
  readonly id: string;
  readonly platform: 'darwin' | 'win32';
  readonly arch: 'arm64' | 'x64';
  readonly artifactName: string;
  readonly executableName: string;
  readonly launcherName: string;
  readonly installerName: string;
  readonly uninstallerName: string;
  readonly installDirectory: string;
  readonly hostManifest: {
    readonly directory: string;
    readonly fileName: string;
  };
  readonly registration: ReleaseRegistration | null;
}

export interface HostManifestDocument {
  readonly name: string;
  readonly description: string;
  readonly path: string;
  readonly type: 'stdio';
  readonly allowed_origins: readonly string[];
}

export interface ReleasePlanTarget {
  readonly id: string;
  readonly platform: string;
  readonly arch: string;
  readonly artifactName: string;
  readonly executableName: string;
  readonly launcherName: string;
  readonly installerName: string;
  readonly uninstallerName: string;
  readonly installDirectory: string;
  readonly hostManifest: {
    readonly directory: string;
    readonly fileName: string;
    readonly document: HostManifestDocument | null;
  };
  readonly registration: ReleaseRegistration | null;
}

export interface ReleasePlan {
  readonly version: string;
  readonly protocolVersion: number;
  readonly nodeVersion: string;
  readonly hostName: string;
  readonly targets: readonly ReleasePlanTarget[];
}

export declare const BRIDGE_HOST_NAME: string;
export declare const BRIDGE_HOST_DESCRIPTION: string;
export declare const SEA_FUSE: string;
export declare const SEA_BLOB_RESOURCE: string;
export declare const SEA_MACHO_SEGMENT: string;
export declare const EXTENSION_ID_PATTERN: RegExp;
export declare const RELEASE_TARGETS: readonly ReleaseTarget[];

export declare function findReleaseTarget(id: string): ReleaseTarget | null;
export declare function isValidExtensionId(value: unknown): value is string;
export declare function launcherPathFor(target: ReleaseTarget): string;
export declare function executablePathFor(target: ReleaseTarget, directory?: string): string;
export declare function buildHostManifest(
  target: ReleaseTarget,
  options: { readonly extensionId: string; readonly launcherPath: string },
): HostManifestDocument;
export declare function buildLauncher(
  target: ReleaseTarget,
  options: { readonly origin: string; readonly executablePath: string },
): string;
export declare function buildReleasePlan(options: {
  readonly version: string;
  readonly protocolVersion: number;
  readonly nodeVersion: string;
  readonly extensionId?: string | null;
}): ReleasePlan;
