import OpenIDError from "../errors/mfa_error.js";
import type { NextFunction, Request, Response } from "express";
import openIDEncryption from "./encryption/open_id_encryption.js";
import sqlInit from "./sql_init.js";
import options from "./options.js";
import type { Session } from "express-openid-connect";
import sql from "./sql.js";
import config from "./config.js";


function isOpenIDEnabled() {
    if (config.MultiFactorAuthentication.ssoEnabled) {
        if (config.MultiFactorAuthentication.totpEnabled) {
            throw new OpenIDError("Cannot enable both OpenID and TOTP!");
        }

        if (config.MultiFactorAuthentication.oauthBaseUrl === "") {
            throw new OpenIDError("oauthBaseUrl is undefined!");
        }
        if (config.MultiFactorAuthentication.oauthClientId === "") {
            throw new OpenIDError("oauthClientId is undefined!");
        }
        if (config.MultiFactorAuthentication.oauthClientSecret === "") {
            throw new OpenIDError("oauthClientSecret is undefined!");
        }
    }

    return config.MultiFactorAuthentication.ssoEnabled;
}

function isUserSaved() {
    const data = sql.getValue<string>("SELECT isSetup FROM user_data;");
    return data === "true" ? true : false;
}

function getUsername() {
    const username = sql.getValue<string>("SELECT username FROM user_data;");
    return username;
}

function getUserEmail() {
    const email = sql.getValue<string>("SELECT email FROM user_data;");
    return email;
}

function clearSavedUser() {
    sql.execute("DELETE FROM user_data");
    options.setOption("userSubjectIdentifierSaved", false);
    return {
        success: true,
        message: "Account data removed."
    };
}

function getOAuthStatus() {
    return {
        success: true,
        name: getUsername(),
        email: getUserEmail(),
        enabled: isOpenIDEnabled(),
    };
}

function isTokenValid(req: Request, res: Response, next: NextFunction) {
    const userStatus = openIDEncryption.isSubjectIdentifierSaved();

    if (req.oidc !== undefined) {
        const result = req.oidc
            .fetchUserInfo()
            .then((result) => {
                return {
                    success: true,
                    message: "Token is valid",
                    user: userStatus,
                };
            })
            .catch((result) => {
                return {
                    success: false,
                    message: "Token is not valid",
                    user: userStatus,
                };
            });
        return result;
    } else {
        return {
            success: false,
            message: "Token not set up",
            user: userStatus,
        };
    }
}

function generateOAuthConfig() {
    const authRoutes = {
        callback: "/callback",
        login: "/authenticate",
        postLogoutRedirect: "/login",
        logout: "/logout",
    };

    const logoutParams = {
    };

    const authConfig = {
        authRequired: true,
        auth0Logout: false,
        baseURL: config.MultiFactorAuthentication.oauthBaseUrl,
        clientID: config.MultiFactorAuthentication.oauthClientId,
        issuerBaseURL: "https://accounts.google.com/.well-known/openid-configuration",
        secret: config.MultiFactorAuthentication.oauthClientSecret,
        clientSecret: config.MultiFactorAuthentication.oauthClientSecret,
        authorizationParams: {
            response_type: "code",
            scope: "openid profile email",
        },
        routes: authRoutes,
        idpLogout: false,
        logoutParams: logoutParams,
        afterCallback: async (req: Request, res: Response, session: Session) => {
            if (!sqlInit.isDbInitialized()) return session;

            if (isUserSaved()) return session;

            if (req.oidc.user === undefined) {
                console.log("user invalid!");
            } else {
                openIDEncryption.saveUser(
                    req.oidc.user.sub.toString(),
                    req.oidc.user.name.toString(),
                    req.oidc.user.email.toString());
            }
            return session;
        },
    };
    return authConfig;
}

export default {
    generateOAuthConfig,
    getOAuthStatus,
    isOpenIDEnabled,
    clearSavedUser,
    isTokenValid,
    isUserSaved,
};
