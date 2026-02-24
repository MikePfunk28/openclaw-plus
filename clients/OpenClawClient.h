// OpenClaw Plus Unreal Engine Client
// Add this header to your project's Source folder and add "WebSockets" and "Json" to your Build.cs

#pragma once

#include "CoreMinimal.h"
#include "WebSocketsModule.h"
#include "IWebSocket.h"
#include "Json.h"
#include "OpenClawClient.generated.h"

// Response Types
USTRUCT(BlueprintType)
struct FOpenClawHealth
{
    GENERATED_BODY()
    UPROPERTY(BlueprintReadOnly) bool Ok = false;
    UPROPERTY(BlueprintReadOnly) FString App;
};

USTRUCT(BlueprintType)
struct FOpenClawModel
{
    GENERATED_BODY()
    UPROPERTY(BlueprintReadOnly) FString Id;
    UPROPERTY(BlueprintReadOnly) FString Label;
    UPROPERTY(BlueprintReadOnly) FString Provider;
};

USTRUCT(BlueprintType)
struct FOpenClawRunResult
{
    GENERATED_BODY()
    UPROPERTY(BlueprintReadOnly) FString Answer;
    UPROPERTY(BlueprintReadOnly) bool Done = false;
    UPROPERTY(BlueprintReadOnly) FString SessionId;
    UPROPERTY(BlueprintReadOnly) int32 Cycles = 0;
};

USTRUCT(BlueprintType)
struct FOpenClawShellResult
{
    GENERATED_BODY()
    UPROPERTY(BlueprintReadOnly) bool Ok = false;
    UPROPERTY(BlueprintReadOnly) int32 ExitCode = -1;
    UPROPERTY(BlueprintReadOnly) FString Stdout;
    UPROPERTY(BlueprintReadOnly) FString Stderr;
};

USTRUCT(BlueprintType)
struct FOpenClawSystemInfo
{
    GENERATED_BODY()
    UPROPERTY(BlueprintReadOnly) FString Hostname;
    UPROPERTY(BlueprintReadOnly) FString Platform;
    UPROPERTY(BlueprintReadOnly) int32 CpuCount = 0;
    UPROPERTY(BlueprintReadOnly) int64 TotalMemory = 0;
    UPROPERTY(BlueprintReadOnly) int64 FreeMemory = 0;
};

USTRUCT(BlueprintType)
struct FOpenClawWsMessage
{
    GENERATED_BODY()
    UPROPERTY(BlueprintReadOnly) FString Type;
    UPROPERTY(BlueprintReadOnly) FString PayloadJson;
};

// Delegates
DECLARE_DYNAMIC_DELEGATE_OneParam(FOnHealthResponse, const FOpenClawHealth&, Response);
DECLARE_DYNAMIC_DELEGATE_OneParam(FOnRunResponse, const FOpenClawRunResult&, Response);
DECLARE_DYNAMIC_DELEGATE_OneParam(FOnShellResponse, const FOpenClawShellResult&, Response);
DECLARE_DYNAMIC_DELEGATE_OneParam(FOnSystemInfoResponse, const FOpenClawSystemInfo&, Response);
DECLARE_DYNAMIC_DELEGATE_OneParam(FOnStringResponse, const FString&, Response);
DECLARE_DYNAMIC_DELEGATE_OneParam(FOnWsMessage, const FOpenClawWsMessage&, Message);

UCLASS(BlueprintType)
class OPENCLAW_API UOpenClawClient : public UObject
{
    GENERATED_BODY()

public:
    TSharedPtr<IWebSocket> WebSocket;
    TArray<TSharedPtr<class IHttpRequest>> PendingRequests;

    UFUNCTION(BlueprintCallable, Category = "OpenClaw")
    void Initialize(const FString& BaseUrl = TEXT("http://localhost:8787"), const FString& Token = TEXT(""))
    {
        BaseApiUrl = BaseUrl.EndsWith(TEXT("/")) ? BaseUrl.LeftChop(1) : BaseUrl;
        AuthToken = Token;
    }

    // ============ REST API ============

    UFUNCTION(BlueprintCallable, Category = "OpenClaw")
    void GetHealth(const FOnHealthResponse& OnComplete)
    {
        MakeGetRequest(TEXT("/api/health"), [OnComplete](const TSharedPtr<FJsonObject>& Json)
        {
            FOpenClawHealth Result;
            if (Json.IsValid())
            {
                Result.Ok = Json->GetBoolField(TEXT("ok"));
                Result.App = Json->GetStringField(TEXT("app"));
            }
            OnComplete.ExecuteIfBound(Result);
        });
    }

    UFUNCTION(BlueprintCallable, Category = "OpenClaw")
    void RunTask(const FString& ModelId, const FString& Objective, const FOnRunResponse& OnComplete, 
                 const FString& SessionId = TEXT(""), const TArray<FString>& EnabledSkillIds = TArray<FString>())
    {
        TSharedPtr<FJsonObject> Json = MakeShareable(new FJsonObject);
        Json->SetStringField(TEXT("modelId"), ModelId);
        Json->SetStringField(TEXT("objective"), Objective);
        
        if (!SessionId.IsEmpty())
            Json->SetStringField(TEXT("sessionId"), SessionId);
        
        if (EnabledSkillIds.Num() > 0)
        {
            TArray<TSharedPtr<FJsonValue>> Skills;
            for (const auto& Skill : EnabledSkillIds)
                Skills.Add(MakeShareable(new FJsonValueString(Skill)));
            Json->SetArrayField(TEXT("enabledSkillIds"), Skills);
        }

        MakePostRequest(TEXT("/api/run"), Json, [OnComplete](const TSharedPtr<FJsonObject>& ResponseJson)
        {
            FOpenClawRunResult Result;
            if (ResponseJson.IsValid())
            {
                Result.Answer = ResponseJson->GetStringField(TEXT("answer"));
                Result.Done = ResponseJson->GetBoolField(TEXT("done"));
                Result.Cycles = ResponseJson->GetIntegerField(TEXT("cycles"));
                
                const TSharedPtr<FJsonObject>* SessionObj;
                if (ResponseJson->TryGetObjectField(TEXT("session"), SessionObj))
                    Result.SessionId = (*SessionObj)->GetStringField(TEXT("id"));
            }
            OnComplete.ExecuteIfBound(Result);
        });
    }

    UFUNCTION(BlueprintCallable, Category = "OpenClaw")
    void ExecuteShellCommand(const FString& Command, const FOnShellResponse& OnComplete, 
                             const FString& WorkingDir = TEXT(""), int32 TimeoutMs = 60000)
    {
        TSharedPtr<FJsonObject> Input = MakeShareable(new FJsonObject);
        Input->SetStringField(TEXT("command"), Command);
        if (!WorkingDir.IsEmpty())
            Input->SetStringField(TEXT("cwd"), WorkingDir);
        Input->SetNumberField(TEXT("timeout"), TimeoutMs);
        
        InvokeSkill(TEXT("shell_execute"), Input, [OnComplete](const TSharedPtr<FJsonObject>& Json)
        {
            FOpenClawShellResult Result;
            if (Json.IsValid())
            {
                Result.Ok = Json->GetBoolField(TEXT("ok"));
                Result.ExitCode = Json->GetIntegerField(TEXT("exitCode"));
                Result.Stdout = Json->GetStringField(TEXT("stdout"));
                Result.Stderr = Json->GetStringField(TEXT("stderr"));
            }
            OnComplete.ExecuteIfBound(Result);
        });
    }

    UFUNCTION(BlueprintCallable, Category = "OpenClaw")
    void GetSystemInfo(const FOnSystemInfoResponse& OnComplete)
    {
        TSharedPtr<FJsonObject> Input = MakeShareable(new FJsonObject);
        Input->SetStringField(TEXT("detail"), TEXT("basic"));
        
        InvokeSkill(TEXT("system_info"), Input, [OnComplete](const TSharedPtr<FJsonObject>& Json)
        {
            FOpenClawSystemInfo Result;
            if (Json.IsValid())
            {
                Result.Hostname = Json->GetStringField(TEXT("hostname"));
                Result.Platform = Json->GetStringField(TEXT("platform"));
                
                const TSharedPtr<FJsonObject>* Cpu;
                if (Json->TryGetObjectField(TEXT("cpu"), Cpu))
                    Result.CpuCount = (*Cpu)->GetIntegerField(TEXT("count"));
                
                const TSharedPtr<FJsonObject>* Memory;
                if (Json->TryGetObjectField(TEXT("memory"), Memory))
                {
                    Result.TotalMemory = static_cast<int64>((*Memory)->GetNumberField(TEXT("total")));
                    Result.FreeMemory = static_cast<int64>((*Memory)->GetNumberField(TEXT("free")));
                }
            }
            OnComplete.ExecuteIfBound(Result);
        });
    }

    UFUNCTION(BlueprintCallable, Category = "OpenClaw")
    void InvokeSkill(const FString& SkillId, const TSharedPtr<FJsonObject>& Input, 
                     TFunction<void(const TSharedPtr<FJsonObject>&)> OnComplete)
    {
        MakePostRequest(FString::Printf(TEXT("/api/skills/%s/invoke"), *SkillId), Input, 
            [OnComplete](const TSharedPtr<FJsonObject>& Json)
            {
                TSharedPtr<FJsonObject> Result;
                if (Json.IsValid())
                {
                    const TSharedPtr<FJsonObject>* ResultObj;
                    if (Json->TryGetObjectField(TEXT("result"), ResultObj))
                    {
                        OnComplete(*ResultObj);
                        return;
                    }
                }
                OnComplete(nullptr);
            });
    }

    // ============ WebSocket API ============

    UFUNCTION(BlueprintCallable, Category = "OpenClaw")
    bool WsConnect()
    {
        if (WebSocket.IsValid() && WebSocket->IsConnected())
            return true;

        FString WsUrl = BaseApiUrl.Replace(TEXT("http://"), TEXT("ws://")).Replace(TEXT("https://"), TEXT("wss://")) + TEXT("/ws");
        if (!AuthToken.IsEmpty())
            WsUrl += FString::Printf(TEXT("?token=%s"), *AuthToken);

        TMap<FString, FString> Headers;
        WebSocket = FWebSocketsModule::Get().CreateWebSocket(WsUrl, TEXT(""), Headers);

        if (!WebSocket.IsValid())
            return false;

        WebSocket->OnConnected().AddLambda([this]()
        {
            UE_LOG(LogTemp, Log, TEXT("OpenClaw WebSocket connected"));
            bWsConnected = true;
            OnWsConnected.Broadcast();
        });

        WebSocket->OnConnectionError().AddLambda([this](const FString& Error)
        {
            UE_LOG(LogTemp, Error, TEXT("OpenClaw WebSocket error: %s"), *Error);
            bWsConnected = false;
        });

        WebSocket->OnClosed().AddLambda([this](int32 StatusCode, const FString& Reason, bool bWasClean)
        {
            UE_LOG(LogTemp, Log, TEXT("OpenClaw WebSocket closed: %s"), *Reason);
            bWsConnected = false;
            OnWsDisconnected.Broadcast();
        });

        WebSocket->OnMessage().AddLambda([this](const FString& Message)
        {
            TSharedPtr<FJsonObject> Json;
            TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Message);
            
            if (FJsonSerializer::Deserialize(Reader, Json) && Json.IsValid())
            {
                FString Type = Json->GetStringField(TEXT("type"));
                FOpenClawWsMessage Msg;
                Msg.Type = Type;
                Msg.PayloadJson = Message;
                OnWsMessage.Broadcast(Msg);
                
                if (Type == TEXT("hello"))
                    OnWsHello.Broadcast(Message);
                else if (Type == TEXT("progress"))
                    OnWsProgress.Broadcast(Message);
                else if (Type == TEXT("done"))
                    OnWsDone.Broadcast(Message);
                else if (Type == TEXT("error"))
                    OnWsError.Broadcast(Message);
            }
        });

        WebSocket->Connect();
        return true;
    }

    UFUNCTION(BlueprintCallable, Category = "OpenClaw")
    void WsDisconnect()
    {
        if (WebSocket.IsValid())
        {
            WebSocket->Close();
            WebSocket.Reset();
        }
        bWsConnected = false;
    }

    UFUNCTION(BlueprintCallable, Category = "OpenClaw")
    bool WsIsConnected() const
    {
        return bWsConnected && WebSocket.IsValid() && WebSocket->IsConnected();
    }

    UFUNCTION(BlueprintCallable, Category = "OpenClaw")
    void WsSend(const FString& Type, const FString& PayloadJson = TEXT("{}"))
    {
        if (!WsIsConnected())
            return;

        TSharedPtr<FJsonObject> Msg = MakeShareable(new FJsonObject);
        Msg->SetStringField(TEXT("type"), Type);
        
        TSharedPtr<FJsonObject> Payload;
        TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(PayloadJson);
        if (FJsonSerializer::Deserialize(Reader, Payload) && Payload.IsValid())
        {
            for (const auto& Pair : Payload->Values)
                Msg->Values.Add(Pair.Key, Pair.Value);
        }

        FString Output;
        TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Output);
        FJsonSerializer::Serialize(Msg.ToSharedRef(), Writer);
        
        WebSocket->Send(Output);
    }

    UFUNCTION(BlueprintCallable, Category = "OpenClaw")
    void WsInit()
    {
        WsSend(TEXT("init"));
    }

    UFUNCTION(BlueprintCallable, Category = "OpenClaw")
    void WsPing()
    {
        WsSend(TEXT("ping"));
    }

    UFUNCTION(BlueprintCallable, Category = "OpenClaw")
    void WsRun(const FString& ModelId, const FString& Objective, const FString& SessionId = TEXT(""))
    {
        FString Payload = FString::Printf(TEXT("{\"modelId\":\"%s\",\"objective\":\"%s\""), *ModelId, *Objective);
        if (!SessionId.IsEmpty())
            Payload += FString::Printf(TEXT(",\"sessionId\":\"%s\""), *SessionId);
        Payload += TEXT("}");
        WsSend(TEXT("run"), Payload);
    }

    // Events
    UPROPERTY(BlueprintAssignable, Category = "OpenClaw")
    FOnWsMessage OnWsMessage;

    UPROPERTY(BlueprintAssignable, Category = "OpenClaw")
    FOnStringResponse OnWsConnected;

    UPROPERTY(BlueprintAssignable, Category = "OpenClaw")
    FOnStringResponse OnWsDisconnected;

    UPROPERTY(BlueprintAssignable, Category = "OpenClaw")
    FOnStringResponse OnWsHello;

    UPROPERTY(BlueprintAssignable, Category = "OpenClaw")
    FOnStringResponse OnWsProgress;

    UPROPERTY(BlueprintAssignable, Category = "OpenClaw")
    FOnStringResponse OnWsDone;

    UPROPERTY(BlueprintAssignable, Category = "OpenClaw")
    FOnStringResponse OnWsError;

private:
    FString BaseApiUrl;
    FString AuthToken;
    bool bWsConnected = false;

    void MakeGetRequest(const FString& Path, TFunction<void(const TSharedPtr<FJsonObject>&)> OnComplete)
    {
        TSharedRef<IHttpRequest> Request = FHttpModule::Get().CreateRequest();
        Request->SetURL(BaseApiUrl + Path);
        Request->SetVerb(TEXT("GET"));
        Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
        
        if (!AuthToken.IsEmpty())
            Request->SetHeader(TEXT("Authorization"), FString::Printf(TEXT("Bearer %s"), *AuthToken));

        Request->OnProcessRequestComplete().BindLambda([OnComplete](FHttpRequestPtr Req, FHttpResponsePtr Resp, bool bSuccess)
        {
            TSharedPtr<FJsonObject> Json;
            if (bSuccess && Resp.IsValid())
            {
                TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Resp->GetContentAsString());
                FJsonSerializer::Deserialize(Reader, Json);
            }
            OnComplete(Json);
        });

        Request->ProcessRequest();
        PendingRequests.Add(Request);
    }

    void MakePostRequest(const FString& Path, const TSharedPtr<FJsonObject>& Body, 
                         TFunction<void(const TSharedPtr<FJsonObject>&)> OnComplete)
    {
        TSharedRef<IHttpRequest> Request = FHttpModule::Get().CreateRequest();
        Request->SetURL(BaseApiUrl + Path);
        Request->SetVerb(TEXT("POST"));
        Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
        
        if (!AuthToken.IsEmpty())
            Request->SetHeader(TEXT("Authorization"), FString::Printf(TEXT("Bearer %s"), *AuthToken));

        FString BodyString;
        TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&BodyString);
        FJsonSerializer::Serialize(Body.ToSharedRef(), Writer);
        Request->SetContentAsString(BodyString);

        Request->OnProcessRequestComplete().BindLambda([OnComplete](FHttpRequestPtr Req, FHttpResponsePtr Resp, bool bSuccess)
        {
            TSharedPtr<FJsonObject> Json;
            if (bSuccess && Resp.IsValid())
            {
                TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Resp->GetContentAsString());
                FJsonSerializer::Deserialize(Reader, Json);
            }
            OnComplete(Json);
        });

        Request->ProcessRequest();
        PendingRequests.Add(Request);
    }
};
