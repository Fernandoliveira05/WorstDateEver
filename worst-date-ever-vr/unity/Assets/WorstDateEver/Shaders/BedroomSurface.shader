Shader "WorstDateEver/BedroomSurface"
{
    Properties
    {
        _MainTex ("Surface color", 2D) = "white" {}
        _Color ("Tint", Color) = (1,1,1,1)
        _Frequency ("Repeats per meter", Vector) = (1,1,0,0)
        _Strength ("Texture strength", Range(0,1)) = 1
        _Smoothness ("Smoothness", Range(0,1)) = .22
        _Metallic ("Metallic", Range(0,1)) = 0
        _UseUV ("Use modeled UVs", Range(0,1)) = 0
        [Enum(UnityEngine.Rendering.CullMode)] _Cull ("Cull", Float) = 2
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" }
        Cull [_Cull]
        CGPROGRAM
        #pragma surface surf Standard fullforwardshadows addshadow nolightmap vertex:vert
        #pragma target 3.5

        sampler2D _MainTex;
        half4 _Color;
        half4 _Frequency;
        half _Strength, _Smoothness, _Metallic, _UseUV;

        struct Input
        {
            float2 uv_MainTex;
            float3 surfacePosition;
            float3 surfaceNormal;
        };

        void vert(inout appdata_full vertex, out Input o)
        {
            UNITY_INITIALIZE_OUTPUT(Input,o);
            float3x3 localToWorld = (float3x3)unity_ObjectToWorld;
            float3 scale = float3(length(mul(localToWorld,float3(1,0,0))),
                length(mul(localToWorld,float3(0,1,0))),length(mul(localToWorld,float3(0,0,1))));
            o.surfacePosition = vertex.vertex.xyz*scale;
            o.surfaceNormal = vertex.normal;
        }

        void surf(Input i, inout SurfaceOutputStandard o)
        {
            half3 detail;
            if (_UseUV > .5)
                detail = tex2D(_MainTex,i.uv_MainTex*_Frequency.xy).rgb;
            else
            {
                float3 weights = pow(abs(normalize(i.surfaceNormal)),6);
                weights /= max(dot(weights,float3(1,1,1)),.001);
                float3 p = i.surfacePosition;
                detail = tex2D(_MainTex,p.zy*_Frequency.xy).rgb*weights.x
                    +tex2D(_MainTex,p.xz*_Frequency.xy).rgb*weights.y
                    +tex2D(_MainTex,p.xy*_Frequency.xy).rgb*weights.z;
            }
            o.Albedo = _Color.rgb * lerp(1,detail,_Strength);
            o.Smoothness = _Smoothness;
            o.Metallic = _Metallic;
            o.Alpha = 1;
        }
        ENDCG
    }
    FallBack "Standard"
}
